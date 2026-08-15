import { EventEmitter } from "node:events";
import { LcuClient, type LcuEvent } from "./lcu/client.js";
import { waitForCredentials } from "./lcu/credentials.js";
import { GameData } from "./lcu/gamedata.js";
import {
  acceptReadyCheck,
  completeAction,
  describeLcuError,
  parseSession,
  resolveAction,
  setSpells,
  type RawSession,
} from "./lcu/actions.js";
import type {
  AgentState,
  AutomationSettings,
  ChampSelectState,
  GameflowPhase,
  ServerMessage,
} from "./types.js";
import { loadAutomation, saveAutomation } from "./config.js";

const TOPICS = [
  "OnJsonApiEvent_lol-gameflow_v1_gameflow-phase",
  "OnJsonApiEvent_lol-matchmaking_v1_ready-check",
  "OnJsonApiEvent_lol-champ-select_v1_session",
];

/**
 * Owns the connection to the League client: keeps a live snapshot of what the
 * client is doing, applies automation rules, and emits state to subscribers.
 * Reconnects on its own when the client restarts.
 */
export class Session extends EventEmitter {
  private lcu: LcuClient | null = null;
  private gameData: GameData | null = null;
  private panicTimer: NodeJS.Timeout | null = null;
  private lastAutomatedActionId: number | null = null;
  private spellsAppliedForSession = false;

  private state: AgentState = {
    connectedToClient: false,
    summoner: null,
    phase: "None",
    readyCheck: null,
    champSelect: null,
    automation: loadAutomation(),
    log: [],
  };

  getState(): AgentState {
    return this.state;
  }

  getGameData(): GameData {
    if (!this.gameData) throw new Error("Not connected to the League client yet.");
    return this.gameData;
  }

  getClient(): LcuClient {
    if (!this.lcu) throw new Error("Not connected to the League client yet.");
    return this.lcu;
  }

  isConnected(): boolean {
    return this.state.connectedToClient;
  }

  // --- Lifecycle -----------------------------------------------------------

  async start(): Promise<void> {
    for (;;) {
      const credentials = await waitForCredentials(() =>
        this.log("Waiting for the League client to start…"),
      );

      const lcu = new LcuClient(credentials);
      try {
        // A live request proves the client finished booting; the lockfile
        // appears before the API is ready to answer.
        await lcu.get("/lol-summoner/v1/current-summoner");
      } catch {
        lcu.destroy();
        await delay(2000);
        continue;
      }

      this.lcu = lcu;
      this.gameData = new GameData(lcu);
      await this.gameData.load();

      lcu.on("event", (event: LcuEvent) => void this.onLcuEvent(event));
      lcu.connectEvents(TOPICS);

      this.state.connectedToClient = true;
      await this.refreshAll();
      this.log("Connected to the League client.");

      // Park here until the client goes away, then loop and reconnect.
      await new Promise<void>((resolve) => lcu.once("close", resolve));

      this.log("Lost the League client. Waiting for it to come back…");
      lcu.destroy();
      this.lcu = null;
      this.gameData = null;
      this.state = {
        ...this.state,
        connectedToClient: false,
        phase: "None",
        readyCheck: null,
        champSelect: null,
      };
      this.publish();
      await delay(2000);
    }
  }

  // --- Event handling ------------------------------------------------------

  private async onLcuEvent(event: LcuEvent): Promise<void> {
    try {
      if (event.uri === "/lol-gameflow/v1/gameflow-phase") {
        this.state.phase = (event.data as GameflowPhase) ?? "None";
        if (this.state.phase !== "ChampSelect") {
          this.state.champSelect = null;
          this.spellsAppliedForSession = false;
          this.lastAutomatedActionId = null;
          this.clearPanicTimer();
        }
        this.publish();
        return;
      }

      if (event.uri === "/lol-matchmaking/v1/ready-check") {
        await this.onReadyCheck(event);
        return;
      }

      if (event.uri === "/lol-champ-select/v1/session") {
        await this.onChampSelect(event);
      }
    } catch (error) {
      this.log(`Event handling failed: ${describeLcuError(error)}`);
      this.publish();
    }
  }

  private async onReadyCheck(event: LcuEvent): Promise<void> {
    if (event.eventType === "Delete" || !event.data) {
      this.state.readyCheck = null;
      this.publish();
      return;
    }

    const data = event.data as {
      state: string;
      playerResponse: string;
      timer: number;
    };
    const wasPending = this.state.readyCheck?.state === "InProgress";
    this.state.readyCheck = {
      state: data.state,
      playerResponse: data.playerResponse,
      timer: data.timer,
    };
    this.publish();

    const pending = data.state === "InProgress" && data.playerResponse === "None";
    if (pending && !wasPending) {
      this.emit("alert", {
        type: "alert",
        kind: "ready-check",
        message: "Match found — accept now!",
      } satisfies ServerMessage);
    }

    if (pending && this.state.automation.autoAccept) {
      const wait = this.state.automation.autoAcceptDelayMs;
      setTimeout(() => void this.autoAccept(), wait);
    }
  }

  private async autoAccept(): Promise<void> {
    if (!this.lcu) return;
    if (this.state.readyCheck?.playerResponse !== "None") return;
    try {
      await acceptReadyCheck(this.lcu);
      this.log("Auto-accepted the ready check.");
    } catch (error) {
      this.log(`Auto-accept failed: ${describeLcuError(error)}`);
    }
    this.publish();
  }

  private async onChampSelect(event: LcuEvent): Promise<void> {
    if (event.eventType === "Delete" || !event.data) {
      this.state.champSelect = null;
      this.spellsAppliedForSession = false;
      this.lastAutomatedActionId = null;
      this.clearPanicTimer();
      this.publish();
      return;
    }

    const raw = event.data as RawSession;
    const previous = this.state.champSelect;
    this.state.champSelect = parseSession(raw, await this.readSelection());
    this.publish();

    const action = this.state.champSelect.myAction;
    if (action?.isInProgress && previous?.myAction?.id !== action.id) {
      this.emit("alert", {
        type: "alert",
        kind: action.type === "ban" ? "ban-turn" : "pick-turn",
        message: action.type === "ban" ? "Your turn to ban." : "Your turn to pick.",
      } satisfies ServerMessage);
    }

    await this.runChampSelectAutomation();
  }

  private async readSelection(): Promise<ChampSelectState["selection"]> {
    if (!this.lcu) return null;
    try {
      return await this.lcu.get<ChampSelectState["selection"]>(
        "/lol-champ-select/v1/session/my-selection",
      );
    } catch {
      return null;
    }
  }

  // --- Automation ----------------------------------------------------------

  private async runChampSelectAutomation(): Promise<void> {
    const { automation } = this.state;
    const select = this.state.champSelect;
    if (!this.lcu || !select) return;

    if (
      !this.spellsAppliedForSession &&
      automation.autoSpell1Id > 0 &&
      automation.autoSpell2Id > 0
    ) {
      this.spellsAppliedForSession = true;
      try {
        await setSpells(this.lcu, automation.autoSpell1Id, automation.autoSpell2Id);
        this.log("Applied preset summoner spells.");
      } catch (error) {
        this.log(`Could not set spells: ${describeLcuError(error)}`);
      }
    }

    const action = select.myAction;
    if (!action?.isInProgress || action.completed) {
      this.clearPanicTimer();
      return;
    }

    // One automated attempt per action, so a rejected pick does not spin.
    if (this.lastAutomatedActionId !== action.id) {
      this.lastAutomatedActionId = action.id;

      const championId =
        action.type === "ban"
          ? automation.autoBanChampionId
          : automation.autoPickChampionId;
      const lock =
        action.type === "ban" ? automation.autoBanLock : automation.autoPickLock;

      if (championId > 0) {
        try {
          await resolveAction(this.lcu, action.id, championId, lock);
          const name = this.gameData?.championName(championId) ?? String(championId);
          this.log(`Auto-${action.type}: ${name}${lock ? " (locked)" : " (hovered)"}.`);
        } catch (error) {
          this.log(`Auto-${action.type} failed: ${describeLcuError(error)}`);
        }
      }
    }

    this.armPanicLock(action.id, select.timeLeftMs);
  }

  /**
   * Locks whatever is hovered just before the turn expires, so a phone that
   * loses signal mid-select still ends with a champion instead of a random one.
   */
  private armPanicLock(actionId: number, timeLeftMs: number): void {
    const threshold = this.state.automation.panicLockAtSeconds * 1000;
    this.clearPanicTimer();
    if (threshold <= 0 || timeLeftMs <= 0) return;

    const fireIn = timeLeftMs - threshold;
    if (fireIn <= 0) return;

    this.panicTimer = setTimeout(() => {
      void (async () => {
        const current = this.state.champSelect?.myAction;
        if (!this.lcu || !current || current.id !== actionId || current.completed) return;
        if (current.championId <= 0) return; // Nothing hovered; nothing to lock.
        try {
          await completeAction(this.lcu, actionId);
          this.log("Panic-locked the hovered champion before time ran out.");
          this.publish();
        } catch (error) {
          this.log(`Panic lock failed: ${describeLcuError(error)}`);
        }
      })();
    }, fireIn);
  }

  private clearPanicTimer(): void {
    if (this.panicTimer) clearTimeout(this.panicTimer);
    this.panicTimer = null;
  }

  updateAutomation(patch: Partial<AutomationSettings>): AutomationSettings {
    this.state.automation = { ...this.state.automation, ...patch };
    saveAutomation(this.state.automation);
    this.publish();
    return this.state.automation;
  }

  // --- Snapshot ------------------------------------------------------------

  /** Pulls a fresh snapshot; used on connect and whenever a phone attaches. */
  async refreshAll(): Promise<void> {
    if (!this.lcu) return;
    try {
      const summoner = await this.lcu.get<{
        displayName: string;
        gameName?: string;
        tagLine?: string;
        summonerId: number;
        profileIconId: number;
      }>("/lol-summoner/v1/current-summoner");

      this.state.summoner = {
        displayName:
          summoner.gameName && summoner.tagLine
            ? `${summoner.gameName}#${summoner.tagLine}`
            : summoner.displayName,
        summonerId: summoner.summonerId,
        profileIconId: summoner.profileIconId,
      };
    } catch {
      this.state.summoner = null;
    }

    try {
      this.state.phase = await this.lcu.get<GameflowPhase>(
        "/lol-gameflow/v1/gameflow-phase",
      );
    } catch {
      this.state.phase = "None";
    }

    try {
      const raw = await this.lcu.get<RawSession>("/lol-champ-select/v1/session");
      this.state.champSelect = parseSession(raw, await this.readSelection());
    } catch {
      this.state.champSelect = null;
    }

    this.publish();
  }

  log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`[agent] ${message}`);
    this.state.log = [{ at: Date.now(), message }, ...this.state.log].slice(0, 50);
    this.publish();
  }

  private publish(): void {
    this.emit("state", { type: "state", state: this.state } satisfies ServerMessage);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
