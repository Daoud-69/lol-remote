import { LcuClient, LcuError } from "./client.js";
import type {
  ChampSelectState,
  GameQueue,
  LobbyPositions,
  MyAction,
  PositionPreference,
  TeammateSlot,
} from "../types.js";

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

// --- Lobby role selection --------------------------------------------------

/**
 * Sets the two role preferences the lobby's position selector shows.
 *
 * The client wants both slots on every call — sending only `firstPreference`
 * silently blanks the second — so callers pass the pair they want to end up
 * with, not a delta.
 */
export async function setPositionPreferences(
  lcu: LcuClient,
  first: PositionPreference,
  second: PositionPreference,
): Promise<void> {
  await lcu.put("/lol-lobby/v2/lobby/members/localMember/position-preferences", {
    firstPreference: first,
    secondPreference: second,
  });
}

interface RawLobbyMember {
  firstPositionPreference: string | null;
  secondPositionPreference: string | null;
}

interface RawLobby {
  gameConfig?: { showPositionSelector?: boolean; queueId?: number };
  localMember?: RawLobbyMember;
}

/** Current role selector state, or null when we are not in a lobby at all. */
export async function readPositions(lcu: LcuClient): Promise<LobbyPositions | null> {
  try {
    const lobby = await lcu.get<RawLobby>("/lol-lobby/v2/lobby");
    return {
      first: (lobby.localMember?.firstPositionPreference || "UNSELECTED") as PositionPreference,
      second: (lobby.localMember?.secondPositionPreference || "UNSELECTED") as PositionPreference,
      selectable: Boolean(lobby.gameConfig?.showPositionSelector),
      queueId: lobby.gameConfig?.queueId ?? 0,
      // Resolved by the session, which holds the id-to-name cache; naming it
      // here would mean another round trip on every lobby event.
      queueName: "",
    };
  } catch {
    // 404 here just means "no lobby", which is not worth surfacing as an error.
    return null;
  }
}

// --- Champ select ----------------------------------------------------------

/**
 * Declares an intended champion during the planning phase, before bans.
 *
 * This has to go through the pick action with `completed: false` — the same
 * call a hover uses — because that is what sets `championPickIntent` and puts
 * the champion on everyone's screen. Patching `my-selection` with a championId
 * is accepted by the client and returns success, but shows nothing: it updates
 * the local selection record without telling the lobby, so the slot stays
 * empty. Falls back to it only if the action patch is refused.
 */
export async function declarePickIntent(
  lcu: LcuClient,
  pickActionId: number,
  championId: number,
): Promise<void> {
  if (pickActionId > 0) {
    try {
      await resolveAction(lcu, pickActionId, championId, false);
      return;
    } catch {
      // Some queues have no declare step; fall through rather than fail loudly.
    }
  }
  await lcu.patch("/lol-champ-select/v1/session/my-selection", { championId });
}

/** Champions still legal to pick right now. Empty set outside champ select. */
export async function pickableChampionIds(lcu: LcuClient): Promise<Set<number>> {
  try {
    return new Set(
      await lcu.get<number[]>("/lol-champ-select/v1/pickable-champion-ids"),
    );
  } catch {
    return new Set();
  }
}

export async function bannableChampionIds(lcu: LcuClient): Promise<Set<number>> {
  try {
    return new Set(
      await lcu.get<number[]>("/lol-champ-select/v1/bannable-champion-ids"),
    );
  } catch {
    return new Set();
  }
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

/** Our pick action id, in progress or not. 0 when we have no pick to make. */
export function findMyPickActionId(session: RawSession): number {
  const mine = session.actions
    .flat()
    .find(
      (action) =>
        action.actorCellId === session.localPlayerCellId &&
        action.type === "pick" &&
        !action.completed,
    );
  return mine?.id ?? 0;
}

export function parseSession(
  raw: RawSession,
  selection: ChampSelectState["selection"],
  requested?: LobbyPositions | null,
): ChampSelectState {
  const me = (raw.myTeam ?? []).find((p) => p.cellId === raw.localPlayerCellId);

  // `my-selection` does not consistently include championId, so the team slot
  // is the reliable answer for "what am I locked into" — which is what gates
  // the skin picker.
  const resolvedSelection: ChampSelectState["selection"] = selection
    ? { ...selection, championId: selection.championId || me?.championId || 0 }
    : null;

  // The client spells positions lowercase here and uppercase everywhere else.
  const assigned = (me?.assignedPosition ?? "").toUpperCase();

  // "FILL" means we asked for anything, so nothing counts as an autofill. With
  // no role selector at all (ARAM) there is no assignment to compare against.
  const asked = [requested?.first, requested?.second].filter(
    (p): p is PositionPreference => Boolean(p) && p !== "UNSELECTED",
  );
  const autofilled =
    Boolean(assigned) &&
    asked.length > 0 &&
    !asked.includes("FILL") &&
    !asked.includes(assigned as PositionPreference);

  return {
    phase: raw.timer?.phase ?? "",
    timeLeftMs: raw.timer?.adjustedTimeLeftInPhase ?? 0,
    localPlayerCellId: raw.localPlayerCellId,
    myAction: findMyAction(raw),
    myPickActionId: findMyPickActionId(raw),
    myTeam: (raw.myTeam ?? []).map((p) => toSlot(p, raw.localPlayerCellId)),
    theirTeam: (raw.theirTeam ?? []).map((p) => toSlot(p, raw.localPlayerCellId)),
    bans: raw.bans ?? { myTeamBans: [], theirTeamBans: [] },
    myAssignedPosition: assigned,
    autofilled,
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

// --- Game modes ------------------------------------------------------------

/**
 * Raw queue as the client describes it. Riot adds, removes and rotates modes
 * constantly, so this is read live rather than baked into a list here — that is
 * the whole reason the mode picker works for a mode that did not exist when
 * this shipped.
 */
interface RawQueue {
  id: number;
  name?: string;
  shortName?: string;
  description?: string;
  detailedDescription?: string;
  category?: string;
  gameMode?: string;
  /** e.g. NORMAL, RANKED_SOLO_5x5, JADE_BOT — the only field that tells
   *  Classic PvP apart from Classic Co-op vs. AI. */
  type?: string;
  mapId?: number;
  isRanked?: boolean;
  isVisible?: boolean;
  isTeamBuilderManaged?: boolean;
  queueAvailability?: string;
  maximumParticipantListSize?: number;
  numPlayersPerTeam?: number;
  /** Older clients exposed this instead of queueAvailability. */
  isAvailable?: boolean;
  /** `id` here is the mutator that picks blind vs draft for a custom lobby. */
  gameTypeConfig?: { id?: number };
}

/**
 * The modes this account can actually queue for right now.
 *
 * Filtered rather than passed through whole: the endpoint returns hundreds of
 * entries, most of them retired events, bot difficulties and internal rows the
 * client itself never shows. What is left is what the client's own play menu
 * would offer.
 */
export async function listQueues(lcu: LcuClient): Promise<GameQueue[]> {
  const [raw, labels] = await Promise.all([
    lcu.get<RawQueue[]>("/lol-game-queues/v1/queues"),
    mapLabels(lcu),
  ]);

  const queues = raw
    .filter((queue) => {
      if (!queue.id || queue.id < 0) return false;
      if (queue.isVisible === false) return false;
      // Two spellings across client versions; absent means "no opinion", which
      // we treat as available rather than hiding a mode that works.
      if (queue.queueAvailability && queue.queueAvailability !== "Available") return false;
      if (queue.isAvailable === false) return false;
      // Customs are kept, but they are built through a different call — see
      // createCustomLobby — so they are flagged rather than mixed in.
      return Boolean(queue.name || queue.shortName);
    })
    .map((queue) => ({
      id: queue.id,
      // shortName is what the client's own buttons say ("Draft Pick"); name is
      // the long form ("5v5 Draft Pick games").
      name: (queue.shortName || queue.name || `Queue ${queue.id}`).trim(),
      description: (queue.description || queue.detailedDescription || "").trim(),
      gameMode: queue.gameMode ?? "",
      category: queue.category ?? "",
      isRanked: isRankedQueue(queue),
      teamSize: queue.numPlayersPerTeam ?? 0,
      isBots: isBotQueue(queue),
      isCustom: queue.category === "Custom",
      // The heading this belongs under, in the client’s own words.
      group:
        labels.get(`${queue.mapId}|${queue.gameMode}`) ??
        labels.get(`${queue.mapId}|`) ??
        "Other modes",
    }));

  return queues;
}

/**
 * Whether a queue is really ranked.
 *
 * `isRanked` alone is not enough: the client reports it `true` for 4310
 * (`JADE_RANKED_SOLO_5x5`, "Classic 5v5"), which its own UI does not present as
 * a ranked queue — the type name inherits "RANKED_SOLO_5x5" from the ruleset the
 * mode is built on, not from being ranked itself. Every genuinely ranked queue's
 * type *starts* with `RANKED_` (`RANKED_SOLO_5x5`, `RANKED_FLEX_SR`,
 * `RANKED_TFT`, `RANKED_TFT_DOUBLE_UP`), while mode-specific variants carry a
 * prefix, so requiring both the flag and that prefix separates them.
 *
 * Deliberately biased towards under-badging: failing to mark a ranked queue is a
 * missing badge, while marking a casual one ranked is a lie about what you are
 * queueing into.
 */
function isRankedQueue(queue: RawQueue): boolean {
  return Boolean(queue.isRanked) && /^RANKED_/.test((queue.type ?? "").toUpperCase());
}

/**
 * Whether a queue is played against bots.
 *
 * `category` is not trustworthy for this. Classic Rift ships as two queues that
 * are identical in name, gameMode and map — 4310 (`JADE_RANKED_SOLO_5x5`,
 * "Classic 5v5") and 4320 (`JADE_BOT`, "Classic Co-op vs. AI") — and the client
 * files the second under Co-op vs. AI while the API calls *both* `category:
 * "PvP"`. The `type` is what actually distinguishes them, so that is what this
 * reads. Matching `BOT` as a whole underscore-delimited word covers the shapes
 * seen in the wild (`JADE_BOT`, `RIOTSCRIPT_BOT`) without also catching a mode
 * that merely has "bot" inside a longer word.
 */
function isBotQueue(queue: RawQueue): boolean {
  if (queue.category === "VersusAi") return true;
  return /(^|_)BOT(_|$)/.test((queue.type ?? "").toUpperCase());
}

/**
 * Puts the client in a lobby for one mode, which is what "pick a mode" means to
 * the client — there is no mode setting, only which lobby you are sitting in.
 * Called with a queue we are already in, the client treats it as a no-op rather
 * than an error.
 */
export async function createLobby(lcu: LcuClient, queueId: number): Promise<void> {
  await lcu.post("/lol-lobby/v2/lobby", { queueId });
}

/** Leaves the current lobby, so the client lands back on its play menu. */
export async function leaveLobby(lcu: LcuClient): Promise<void> {
  await lcu.request("DELETE", "/lol-lobby/v2/lobby");
}

/**
 * Every queue id the client knows, named — including the customs the mode
 * picker deliberately hides.
 *
 * The picker's list and the label for the lobby you are *in* are different
 * questions: sitting in a Practice Tool lobby is a real state to report even
 * though it is not a mode you can pick from here, and "Queue 3140" is not a
 * useful thing to show anybody.
 */
export async function readQueueNames(lcu: LcuClient): Promise<Map<number, string>> {
  const raw = await lcu.get<RawQueue[]>("/lol-game-queues/v1/queues");
  return new Map(
    raw
      .filter((queue) => Boolean(queue.id))
      .map((queue) => [
        queue.id,
        (queue.shortName || queue.name || `Queue ${queue.id}`).trim(),
      ]),
  );
}

/**
 * Map labels keyed by `mapId|gameMode`, which is how the client titles the
 * second level of its play menu — those headings are *maps*, not game modes.
 *
 * `gameModeName` is the field to use, not `name`: for the Howling Abyss, `name`
 * reads "Random Map" while `gameModeName` reads "ARAM". It also resolves several
 * things a hand-written list kept getting wrong — Swiftplay comes back as
 * "Summoner's Rift" (it is a ruleset on that map, and the client files it there),
 * the rotating Mayhem codenames all come back as "ARAM", and mapId 453 comes
 * back as "Classic Rift".
 */
async function mapLabels(lcu: LcuClient): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  try {
    const maps = await lcu.get<
      { id: number; gameMode?: string; gameModeName?: string; name?: string; isDefault?: boolean }[]
    >("/lol-maps/v2/maps");
    for (const map of maps) {
      const label = (map.gameModeName || map.name || "").trim();
      if (!label) continue;
      labels.set(`${map.id}|${map.gameMode ?? ""}`, label);
      // A per-map fallback, for a queue whose gameMode has no map row of its own.
      if (map.isDefault || !labels.has(`${map.id}|`)) labels.set(`${map.id}|`, label);
    }
  } catch {
    /* headings degrade to "Other modes" rather than failing the whole list */
  }
  return labels;
}

// --- Custom games ----------------------------------------------------------

/** What the phone can choose when standing up a custom lobby. */
export interface CustomLobbyOptions {
  /** One of the Custom-category queues; it carries the map, mode and mutator. */
  queueId: number;
  name: string;
  teamSize: number;
  password?: string;
  spectators?: "AllAllowed" | "FriendsAllowed" | "LobbyAllowed" | "NotAllowed";
}

/**
 * Creates a custom lobby — which is also how Practice Tool is started.
 *
 * Custom games are the one thing a queue id alone cannot express: posting
 * `{ queueId: 3140 }` is answered with `400 INVALID_REQUEST`. They need a whole
 * `customGameLobby` configuration instead. Rather than hardcode one per mode,
 * the shape is derived from the Custom-category queue the caller picked: that row
 * already carries the map, the game mode and — in `gameTypeConfig.id` — the
 * mutator that decides blind versus draft (19 and 18 on the client this was
 * built against). So "SR Draft Pick Custom" configures itself.
 */
export async function createCustomLobby(
  lcu: LcuClient,
  options: CustomLobbyOptions,
): Promise<void> {
  const queues = await lcu.get<RawQueue[]>("/lol-game-queues/v1/queues");
  const queue = queues.find((row) => row.id === options.queueId);
  if (!queue) throw new Error("That mode is not one the client is offering.");

  const teamSize = Math.max(1, Math.min(options.teamSize || 5, queue.numPlayersPerTeam || 5));
  const mutatorId = queue.gameTypeConfig?.id;

  await lcu.post("/lol-lobby/v2/lobby", {
    // The queue id has to travel *alongside* the configuration. Sending the
    // configuration on its own is rejected — INVALID_LOBBY for Practice Tool,
    // 400 for the rest — and the id is what the client treats as authoritative:
    // asking for 3140 with gameMode CLASSIC still produced a PRACTICETOOL lobby.
    queueId: options.queueId,
    customGameLobby: {
      configuration: {
        gameMode: queue.gameMode ?? "CLASSIC",
        gameMutator: "",
        gameServerRegion: "",
        mapId: queue.mapId ?? 11,
        // Omitting this entirely gets the client's default pick mode, which is
        // wrong for every preset except blind.
        ...(mutatorId ? { mutators: { id: mutatorId } } : {}),
        spectatorPolicy: options.spectators ?? "AllAllowed",
        teamSize,
        maxPlayerCount: teamSize * 2,
      },
      lobbyName: options.name.trim() || "Custom Game",
      // The client wants null rather than "" for "no password".
      lobbyPassword: options.password?.trim() ? options.password.trim() : null,
    },
    isCustom: true,
  });
}

/** A public custom lobby, as the browser lists them. */
export interface CustomGame {
  partyId: string;
  name: string;
  owner: string;
  mapId: number;
  /** Resolved map name, so the phone shows "ARAM" and not a number. */
  map: string;
  hasPassword: boolean;
  players: number;
  maxPlayers: number;
  spectators: number;
  maxSpectators: number;
}

interface RawCustomGame {
  partyId?: string;
  lobbyName?: string;
  ownerDisplayName?: string;
  mapId?: number;
  hasPassword?: boolean;
  filledPlayerSlots?: number;
  maxPlayerSlots?: number;
  filledSpectatorSlots?: number;
  maxSpectatorSlots?: number;
}

/**
 * The public custom lobbies, newest listing the client has.
 *
 * Note the identifier: every row comes back with `id: 0`, and `partyId` is the
 * only thing that distinguishes one lobby from another — 100 rows, 100 distinct
 * party ids, one distinct `id`. Anything keyed on `id` would join the wrong
 * lobby, or nothing at all.
 */
export async function listCustomGames(lcu: LcuClient): Promise<CustomGame[]> {
  const [raw, labels] = await Promise.all([
    lcu.get<RawCustomGame[]>("/lol-lobby/v1/custom-games"),
    mapLabels(lcu),
  ]);
  return raw
    .filter((game) => Boolean(game.partyId))
    .map((game) => ({
      partyId: game.partyId!,
      name: (game.lobbyName || "Untitled lobby").trim(),
      owner: (game.ownerDisplayName || "").trim(),
      mapId: game.mapId ?? 0,
      map: labels.get(`${game.mapId}|`) ?? "",
      hasPassword: Boolean(game.hasPassword),
      players: game.filledPlayerSlots ?? 0,
      maxPlayers: game.maxPlayerSlots ?? 0,
      spectators: game.filledSpectatorSlots ?? 0,
      maxSpectators: game.maxSpectatorSlots ?? 0,
    }));
}

/**
 * Joins a public custom lobby by party id.
 *
 * `/lol-lobby/v1/custom-games/{id}/join` is the obvious-looking route and is the
 * wrong one — it wants a uint64 `id`, which is always 0. The party route takes
 * the uuid that actually identifies a lobby.
 */
export async function joinCustomGame(
  lcu: LcuClient,
  partyId: string,
  password?: string,
): Promise<void> {
  await lcu.post(`/lol-lobby/v2/party/${encodeURIComponent(partyId)}/join`, {
    password: password?.trim() ? password.trim() : "",
  });
}
