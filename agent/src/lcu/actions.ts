import { LcuClient, LcuError } from "./client.js";
import type { ChampSelectState, MyAction, TeammateSlot } from "../types.js";

/** Accepts the ready check. Harmless to call when no check is pending. */
export async function acceptReadyCheck(lcu: LcuClient): Promise<void> {
  await lcu.post("/lol-matchmaking/v1/ready-check/accept");
}

export async function declineReadyCheck(lcu: LcuClient): Promise<void> {
  await lcu.post("/lol-matchmaking/v1/ready-check/decline");
}

/**
 * Hovers or locks a champion for the given action.
 *
 * `completed: false` only hovers — the pick is not committed and teammates see
 * your intent. `completed: true` locks it in and cannot be undone.
 */
export async function resolveAction(
  lcu: LcuClient,
  actionId: number,
  championId: number,
  lock: boolean,
): Promise<void> {
  await lcu.patch(`/lol-champ-select/v1/session/actions/${actionId}`, {
    championId,
    completed: lock,
  });
}

/**
 * Locks whatever is already hovered. Used by the panic-lock safety net, where
 * we want to commit the current hover without changing the champion.
 */
export async function completeAction(lcu: LcuClient, actionId: number): Promise<void> {
  await lcu.post(`/lol-champ-select/v1/session/actions/${actionId}/complete`);
}

export async function setSpells(
  lcu: LcuClient,
  spell1Id: number,
  spell2Id: number,
): Promise<void> {
  await lcu.patch("/lol-champ-select/v1/session/my-selection", { spell1Id, spell2Id });
}

/**
 * Sets the skin for the upcoming game.
 *
 * The client only honours this once your pick is locked — before that there is
 * no champion to skin. Callers should surface that as "lock in first" rather
 * than as a failure.
 */
export async function setSkin(lcu: LcuClient, selectedSkinId: number): Promise<void> {
  await lcu.patch("/lol-champ-select/v1/session/my-selection", { selectedSkinId });
}

export async function setWardSkin(lcu: LcuClient, wardSkinId: number): Promise<void> {
  await lcu.patch("/lol-champ-select/v1/session/my-selection", { wardSkinId });
}

/** ARAM/Swiftplay: swap with a champion sitting on the bench. */
export async function benchSwap(lcu: LcuClient, championId: number): Promise<void> {
  await lcu.post(`/lol-champ-select/v1/session/bench/swap/${championId}`);
}

export async function startQueue(lcu: LcuClient): Promise<void> {
  await lcu.post("/lol-lobby/v2/lobby/matchmaking/search");
}

export async function stopQueue(lcu: LcuClient): Promise<void> {
  await lcu.request("DELETE", "/lol-lobby/v2/lobby/matchmaking/search");
}

// --- Session parsing -------------------------------------------------------

interface RawAction {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  isInProgress: boolean;
  isAllyAction: boolean;
  type: string;
}

interface RawPlayer {
  cellId: number;
  championId: number;
  championPickIntent: number;
  assignedPosition: string;
  spell1Id: number;
  spell2Id: number;
}

interface RawSession {
  actions: RawAction[][];
  localPlayerCellId: number;
  myTeam: RawPlayer[];
  theirTeam: RawPlayer[];
  bans: { myTeamBans: number[]; theirTeamBans: number[] };
  timer: { adjustedTimeLeftInPhase: number; phase: string };
  benchEnabled: boolean;
  benchChampions?: { championId: number }[];
}

function toSlot(player: RawPlayer, localCellId: number): TeammateSlot {
  return {
    cellId: player.cellId,
    championId: player.championId ?? 0,
    championPickIntent: player.championPickIntent ?? 0,
    assignedPosition: player.assignedPosition ?? "",
    spell1Id: player.spell1Id ?? 0,
    spell2Id: player.spell2Id ?? 0,
    isLocalPlayer: player.cellId === localCellId,
  };
}

/**
 * Finds the action the local player is being asked to make.
 *
 * Actions arrive as an array of phases, each holding every player's action for
 * that phase. Only one of ours is ever in progress at a time; we prefer that
 * one and otherwise fall back to our next unfinished action so the UI can show
 * what is coming.
 */
export function findMyAction(session: RawSession): MyAction | null {
  const mine = session.actions
    .flat()
    .filter((action) => action.actorCellId === session.localPlayerCellId);

  const active = mine.find((action) => action.isInProgress && !action.completed);
  const upcoming = mine.find((action) => !action.completed);
  const action = active ?? upcoming;
  if (!action) return null;

  return {
    id: action.id,
    type: action.type as MyAction["type"],
    isInProgress: Boolean(action.isInProgress),
    completed: Boolean(action.completed),
    championId: action.championId ?? 0,
  };
}

export function parseSession(
  raw: RawSession,
  selection: ChampSelectState["selection"],
): ChampSelectState {
  const me = (raw.myTeam ?? []).find((p) => p.cellId === raw.localPlayerCellId);

  // `my-selection` does not consistently include championId, so the team slot
  // is the reliable answer for "what am I locked into" — which is what gates
  // the skin picker.
  const resolvedSelection: ChampSelectState["selection"] = selection
    ? { ...selection, championId: selection.championId || me?.championId || 0 }
    : null;

  return {
    phase: raw.timer?.phase ?? "",
    timeLeftMs: raw.timer?.adjustedTimeLeftInPhase ?? 0,
    localPlayerCellId: raw.localPlayerCellId,
    myAction: findMyAction(raw),
    myTeam: (raw.myTeam ?? []).map((p) => toSlot(p, raw.localPlayerCellId)),
    theirTeam: (raw.theirTeam ?? []).map((p) => toSlot(p, raw.localPlayerCellId)),
    bans: raw.bans ?? { myTeamBans: [], theirTeamBans: [] },
    benchEnabled: Boolean(raw.benchEnabled),
    benchChampionIds: (raw.benchChampions ?? []).map((c) => c.championId),
    selection: resolvedSelection,
  };
}

export type { RawSession };

/** Turns an LCU rejection into something worth showing on a phone screen. */
export function describeLcuError(error: unknown): string {
  if (error instanceof LcuError) {
    try {
      const parsed = JSON.parse(error.body) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // Fall through to the generic description.
    }
    if (error.status === 404) return "The client is not in champion select right now.";
    if (error.status === 400) return "The client rejected that — it may not be your turn.";
    return `League client error ${error.status}.`;
  }
  return error instanceof Error ? error.message : String(error);
}
