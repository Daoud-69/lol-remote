import { EventEmitter } from "node:events";
import { LcuClient, type LcuEvent } from "./lcu/client.js";
import { waitForCredentials } from "./lcu/credentials.js";
import { GameData } from "./lcu/gamedata.js";
import {
  acceptReadyCheck,
  bannableChampionIds,
  completeAction,
  declarePickIntent,
  describeLcuError,
  parseSession,
  pickableChampionIds,
  readPositions,
  resolveAction,
  setPositionPreferences,
  setSpells,
  type RawSession,
} from "./lcu/actions.js";
import { applyRunePage } from "./lcu/runes.js";
import {
  POSITIONS,
  type AgentState,
  type AutomationPatch,
  type AutomationSettings,
  type ChampSelectState,
  type GameflowPhase,
  type LobbyPositions,
  type Position,
  type RolePreset,
  type ServerMessage,
} from "./types.js";
import { loadAutomation, saveAutomation } from "./config.js";

/**
 * How many times to offer a champion for one action before giving up. The
 * client rejects picks and bans briefly around phase changes, so the first
 * attempt failing is routine rather than final.
 */
const MAX_ACTION_ATTEMPTS = 4;

const TOPICS = [
  "OnJsonApiEvent_lol-gameflow_v1_gameflow-phase",
  "OnJsonApiEvent_lol-matchmaking_v1_ready-check",
  "OnJsonApiEvent_lol-champ-select_v1_session",
  "OnJsonApiEvent_lol-lobby_v2_lobby",
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
  /** Attempts made per action id, so a rejection can be retried but not forever. */
  private automationAttempts = new Map<number, number>();
  /** Action we have already reported as having no legal choice left. */
  private exhaustedListForActionId: number | null = null;
  private spellsAppliedForSession = false;
  private declaredForSession = false;
  /** Champion whose runes we already pushed, so a re-render does not re-apply. */
  private runesAppliedFor = 0;

  private state: AgentState = {
    connectedToClient: false,
    summoner: null,
    phase: "None",
    readyCheck: null,
    champSelect: null,
    lobby: null,
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
        lobby: null,
      };
      this.resetChampSelectFlags();
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
          this.resetChampSelectFlags();
        }
        this.publish();
        return;
      }

      if (event.uri === "/lol-matchmaking/v1/ready-check") {
        await this.onReadyCheck(event);
        return;
      }

      if (event.uri === "/lol-lobby/v2/lobby") {
        // The role selector is the one bit of lobby state the phone drives, and
        // it can change from the PC too, so mirror it rather than assume.
        this.state.lobby = this.lcu ? await readPositions(this.lcu) : null;
        this.publish();
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
      this.resetChampSelectFlags();
      this.publish();
      return;
    }

    const raw = event.data as RawSession;
    const previous = this.state.champSelect;
    this.state.champSelect = parseSession(
      raw,
      await this.readSelection(),
      this.state.lobby,
    );
    this.publish();

    const assigned = this.state.champSelect.myAssignedPosition;
    if (assigned && assigned !== previous?.myAssignedPosition) {
      this.log(
        this.state.champSelect.autofilled
          ? `Autofilled to ${titleCase(assigned)} — using that role's picks.`
          : `Assigned ${titleCase(assigned)}.`,
      );
    }

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

  /**
   * The pick list for the role we were actually given.
   *
   * This is the whole autofill story: the client decides our role, we look up
   * what we said we'd play there. With no role assigned (ARAM, blind pick) we
   * fall back to the single flat list.
   */
  private presetForAssignedRole(): RolePreset {
    const { automation } = this.state;
    const assigned = this.state.champSelect?.myAssignedPosition ?? "";

    if (isPosition(assigned)) return automation.rolePresets[assigned];
    return {
      championIds: automation.fallbackChampionIds,
      spell1Id: 0,
      spell2Id: 0,
    };
  }

  /**
   * The champion to act on, given our ordered list.
   *
   * `legal` is the client's own pickable/bannable list, and it is a hint rather
   * than a verdict: right after the ban phase opens it comes back populated but
   * missing champions the client will accept perfectly well a few seconds
   * later. Treating it as a veto meant sitting out the first attempt every
   * single game. So prefer a champion it advertises, and otherwise fall back to
   * our first untaken choice and let the client be the one to say no.
   */
  private firstLegal(candidates: number[], legal: Set<number>, taken: Set<number>): number {
    const available = candidates.filter((id) => id > 0 && !taken.has(id));
    return available.find((id) => legal.has(id)) ?? available[0] ?? 0;
  }

  /** Champions already off the table for a pick: banned, or locked by anyone. */
  private unavailableForPick(): Set<number> {
    const select = this.state.champSelect;
    if (!select) return new Set();
    return new Set([
      ...select.bans.myTeamBans,
      ...select.bans.theirTeamBans,
      ...select.myTeam.map((slot) => (slot.isLocalPlayer ? 0 : slot.championId)),
    ]);
  }

  /** Champions we should not spend a ban on. */
  private unavailableForBan(): Set<number> {
    const select = this.state.champSelect;
    if (!select) return new Set();

    const taken = new Set([...select.bans.myTeamBans, ...select.bans.theirTeamBans]);
    if (this.state.automation.protectTeammatePicks) {
      // Banning the champion a teammate just declared is the classic way an
      // auto-ban list ruins a game before it starts.
      for (const slot of select.myTeam) {
        if (slot.isLocalPlayer) continue;
        if (slot.championPickIntent > 0) taken.add(slot.championPickIntent);
        if (slot.championId > 0) taken.add(slot.championId);
      }
    }
    return taken;
  }

  private async runChampSelectAutomation(): Promise<void> {
    const { automation } = this.state;
    const select = this.state.champSelect;
    if (!this.lcu || !select) return;

    const preset = this.presetForAssignedRole();

    // Role presets override the global spells, which is what keeps an autofill
    // to support from walking in with Smite.
    const spell1 = preset.spell1Id || automation.autoSpell1Id;
    const spell2 = preset.spell2Id || automation.autoSpell2Id;
    if (!this.spellsAppliedForSession && spell1 > 0 && spell2 > 0) {
      this.spellsAppliedForSession = true;
      try {
        await setSpells(this.lcu, spell1, spell2);
        this.log("Applied preset summoner spells.");
      } catch (error) {
        this.log(`Could not set spells: ${describeLcuError(error)}`);
      }
    }

    await this.maybeDeclareIntent(preset);
    await this.maybeApplyRunes();

    const action = select.myAction;
    if (!action?.isInProgress || action.completed) {
      this.clearPanicTimer();
      return;
    }

    // During planning the client already reports the first ban as in progress,
    // but it will not accept one yet and reports nothing as bannable. Acting
    // here achieves nothing and — worse — used to burn this action's one-shot
    // guard, so the real ban turn was skipped a minute later.
    if (select.phase.toUpperCase() === "PLANNING") return;

    // Stop once an action has actually gone through; until then a rejection is
    // worth retrying, since the client refuses picks and bans for a beat around
    // phase boundaries. Capped so a genuinely impossible choice cannot spin.
    const attempts = this.automationAttempts.get(action.id) ?? 0;
    if (this.lastAutomatedActionId !== action.id && attempts < MAX_ACTION_ATTEMPTS) {
      const banning = action.type === "ban";
      const candidates = banning ? automation.banChampionIds : preset.championIds;
      const legal = banning
        ? await bannableChampionIds(this.lcu)
        : await pickableChampionIds(this.lcu);
      const taken = banning ? this.unavailableForBan() : this.unavailableForPick();

      const championId = this.firstLegal(candidates, legal, taken);
      const lock = banning ? automation.autoBanLock : automation.autoPickLock;

      if (championId > 0) {
        this.automationAttempts.set(action.id, attempts + 1);
        const rank = candidates.indexOf(championId);
        try {
          await resolveAction(this.lcu, action.id, championId, lock);
          // Only a call the client accepted closes the action out.
          this.lastAutomatedActionId = action.id;
          const name = this.gameData?.championName(championId) ?? String(championId);
          const fallback = rank > 0 ? ` (choice ${rank + 1})` : "";
          this.log(
            `Auto-${action.type}: ${name}${fallback}${lock ? " (locked)" : " (hovered)"}.`,
          );
        } catch (error) {
          // Quiet on the early tries — the client rejecting a ban a second
          // after the phase opens is normal, and logging it every time reads
          // like a failure when the retry is about to succeed.
          if (attempts + 1 >= MAX_ACTION_ATTEMPTS) {
            this.log(`Auto-${action.type} failed: ${describeLcuError(error)}`);
          }
        }
      } else if (candidates.length > 0 && this.exhaustedListForActionId !== action.id) {
        // Once per action, not once per session event.
        this.exhaustedListForActionId = action.id;
        this.log(
          `No ${action.type} from your list — every choice is already banned or taken.`,
        );
      }
    }

    this.armPanicLock(action.id, select.timeLeftMs);
  }

  /**
   * Puts our intended champion on the team's screen during the planning phase,
   * before any ban happens. Purely declarative — it commits nothing.
   */
  private async maybeDeclareIntent(preset: RolePreset): Promise<void> {
    const select = this.state.champSelect;
    if (!this.lcu || !select) return;
    if (!this.state.automation.declarePickIntent || this.declaredForSession) return;
    if (select.phase.toUpperCase() !== "PLANNING") return;

    const championId = this.firstLegal(
      preset.championIds,
      await pickableChampionIds(this.lcu),
      this.unavailableForPick(),
    );
    if (championId <= 0) return;

    this.declaredForSession = true;
    try {
      await declarePickIntent(this.lcu, select.myPickActionId, championId);
      const name = this.gameData?.championName(championId) ?? String(championId);
      this.log(`Declared ${name} in the planning phase.`);
    } catch (error) {
      this.log(`Could not declare a pick: ${describeLcuError(error)}`);
    }
  }

  /**
   * Pushes the rune page saved for whatever we locked. Runs off the locked
   * champion rather than the hover, since hovers change and rewriting the page
   * on every hover would thrash the client.
   */
  private async maybeApplyRunes(): Promise<void> {
    const select = this.state.champSelect;
    if (!this.lcu || !select) return;
    if (!this.state.automation.applyRunes) return;

    const championId = select.selection?.championId ?? 0;
    if (championId <= 0 || championId === this.runesAppliedFor) return;

    const page = this.state.automation.runePages[championId];
    if (!page) return;

    this.runesAppliedFor = championId;
    const name = this.gameData?.championName(championId) ?? String(championId);
    try {
      await applyRunePage(this.lcu, page, name);
      this.log(`Applied your ${name} rune page.`);
    } catch (error) {
      this.log(`Could not apply runes: ${describeLcuError(error)}`);
    }
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

  /** Everything that is scoped to one champ select and must not leak into the next. */
  private resetChampSelectFlags(): void {
    this.spellsAppliedForSession = false;
    this.declaredForSession = false;
    this.lastAutomatedActionId = null;
    this.automationAttempts.clear();
    this.exhaustedListForActionId = null;
    this.runesAppliedFor = 0;
    this.clearPanicTimer();
  }

  updateAutomation(patch: AutomationPatch): AutomationSettings {
    const previous = this.state.automation;
    this.state.automation = {
      ...previous,
      ...patch,
      // Nested records must merge per key, or setting one role's list would
      // wipe the other four.
      rolePresets: { ...previous.rolePresets, ...patch.rolePresets },
      runePages: { ...previous.runePages, ...patch.runePages },
    };
    saveAutomation(this.state.automation);
    this.publish();
    return this.state.automation;
  }

  /** Deletes a champion's saved rune page — a merge-patch can't express removal. */
  clearRunePage(championId: number): AutomationSettings {
    const runePages = { ...this.state.automation.runePages };
    delete runePages[championId];
    this.state.automation = { ...this.state.automation, runePages };
    saveAutomation(this.state.automation);
    this.publish();
    return this.state.automation;
  }

  /** Pushes role preferences to the lobby and remembers them for next time. */
  async updatePositions(
    first: LobbyPositions["first"],
    second: LobbyPositions["second"],
  ): Promise<LobbyPositions | null> {
    if (!this.lcu) throw new Error("Not connected to the League client yet.");

    await setPositionPreferences(this.lcu, first, second);
    this.state.automation = {
      ...this.state.automation,
      primaryPosition: first,
      secondaryPosition: second,
    };
    saveAutomation(this.state.automation);

    // Reading straight back races the client — the lobby it serves can still be
    // the pre-write one for a beat, which would echo stale roles to the phone.
    // Report what we set and let the lobby event reconcile a moment later.
    this.state.lobby = {
      first,
      second,
      selectable: this.state.lobby?.selectable ?? true,
    };
    this.log(`Set roles to ${titleCase(first)} / ${titleCase(second)}.`);
    this.publish();
    return this.state.lobby;
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

    this.state.lobby = await readPositions(this.lcu);

    try {
      const raw = await this.lcu.get<RawSession>("/lol-champ-select/v1/session");
      this.state.champSelect = parseSession(
        raw,
        await this.readSelection(),
        this.state.lobby,
      );
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

function isPosition(value: string): value is Position {
  return (POSITIONS as string[]).includes(value);
}

/** "UTILITY" reads badly in a log line; "Utility" does not. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
