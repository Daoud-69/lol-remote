import { LcuClient, LcuError } from "./client.js";
import type {
  ChampSelectState,
  GameQueue,
  LobbyPositions,
  MyAction,
  PositionPreference,
  SwapAction,
  SwapKind,
  TeammateSlot,
  TeamSwap,
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
  positionSwaps?: RawSwap[];
  pickOrderSwaps?: RawSwap[];
}

interface RawSwap {
  id: number;
  cellId: number;
  state: string;
}

/** The route segment each kind lives under, which is all that differs between them. */
const SWAP_SEGMENT: Record<SwapKind, string> = {
  position: "position-swaps",
  pickOrder: "pick-order-swaps",
};

/**
 * Both swap lists flattened into one, tagged with which kind they came from.
 *
 * The client keeps them apart because they trade different things, but every
 * other property is identical — same contract, same four verbs — so carrying a
 * discriminator costs less than threading two parallel lists through to the
 * phone and back.
 */
function collectSwaps(raw: RawSession): TeamSwap[] {
  const read = (list: RawSwap[] | undefined, kind: SwapKind): TeamSwap[] =>
    (list ?? [])
      .filter((swap) => swap && typeof swap.id === "number")
      .map((swap) => ({
        id: swap.id,
        cellId: swap.cellId ?? 0,
        // Unknown states are passed through rather than coerced: a state this
        // does not recognise should read as "not offerable", which is what the
        // phone does with anything outside the three it acts on.
        state: (swap.state ?? "INVALID") as TeamSwap["state"],
        kind,
      }));

  return [...read(raw.positionSwaps, "position"), ...read(raw.pickOrderSwaps, "pickOrder")];
}

/**
 * Requests, accepts, declines or cancels one swap.
 *
 * Every verb is a bare POST keyed by the swap's own id — the id identifies both
 * the teammate and the kind, so there is nothing to send in a body.
 */
export async function respondToSwap(
  lcu: LcuClient,
  kind: SwapKind,
  id: number,
  action: SwapAction,
): Promise<void> {
  await lcu.request(
    "POST",
    `/lol-champ-select/v1/session/${SWAP_SEGMENT[kind]}/${id}/${action}`,
  );
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
 * Both sides' bans, keyed by whose they are.
 *
 * `bans` is the obvious source, but it is not the only one and not always the
 * complete one, so the completed ban actions are unioned into it rather than
 * used only as a fallback — that way a side the `bans` object leaves empty
 * still fills in, without depending on which of the two the client populated.
 * `isAllyAction` is what separates the sides; the actor's cell id would need a
 * lookup into both team lists to say the same thing.
 *
 * A champion can only be banned once per game, so a ban already recorded on
 * either side is the same ban seen twice rather than a second one.
 */
function collectBans(raw: RawSession): { myTeamBans: number[]; theirTeamBans: number[] } {
  const mine = new Set((raw.bans?.myTeamBans ?? []).filter(Boolean));
  const theirs = new Set((raw.bans?.theirTeamBans ?? []).filter(Boolean));

  for (const action of (raw.actions ?? []).flat()) {
    if (action.type !== "ban" || !action.completed || !action.championId) continue;
    if (mine.has(action.championId) || theirs.has(action.championId)) continue;
    (action.isAllyAction ? mine : theirs).add(action.championId);
  }

  return { myTeamBans: [...mine], theirTeamBans: [...theirs] };
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
    bans: collectBans(raw),
    swaps: collectSwaps(raw),
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
      // A couple of the client’s own messages are shouted enum names rather
      // than sentences, and these two are the ones a phone actually hits.
      if (parsed.message === "PARTY_NOT_FOUND") {
        return "That party no longer exists — ask for a fresh link.";
      }
      if (parsed.message === "INVALID_LOBBY") {
        return "The client would not accept that lobby.";
      }
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

// --- Friends and parties ---------------------------------------------------

/** A friend, plus their party if they are advertising one. */
/**
 * Where a friend is, as one value.
 *
 * Resolved here rather than on the phone because it takes three separate LCU
 * fields to work out, and none of them alone is the answer: `availability` is a
 * chat status ("dnd" while in a game), `lol.gameStatus` is the real game state,
 * and `product` says whether they are even on League.
 */
export type FriendStatus =
  | "inGame"
  | "championSelect"
  | "inParty"
  | "online"
  | "mobile"
  | "otherGame"
  | "offline";

export interface Friend {
  puuid: string;
  /** Riot ID, e.g. "Faker#KR1". */
  name: string;
  availability: string;
  status: FriendStatus;
  /** True when they are on League rather than another Riot game. */
  playingLeague: boolean;
  /** What they are queued for or playing; 0 when that is not applicable. */
  queueId: number;
  /** Resolved by the session, which holds the queue-name cache. */
  queueName: string;
  statusMessage: string;
  profileIconId: number;
  /** Which of the client’s friend groups they sit in. */
  groupId: number;
  groupName: string;
  party: {
    partyId: string;
    /** Only an open party can be joined without an invite. */
    isOpen: boolean;
    queueId: number;
    /** Resolved by the session, which holds the queue-name cache. */
    queueName: string;
    players: number;
    maxPlayers: number;
  } | null;
}

interface RawFriend {
  puuid?: string;
  gameName?: string;
  gameTag?: string;
  name?: string;
  availability?: string;
  productName?: string;
  product?: string;
  statusMessage?: string;
  icon?: number;
  displayGroupId?: number;
  displayGroupName?: string;
  // Presence is stringly typed: queueId arrives as "420", not 420.
  lol?: { pty?: string; gameStatus?: string; queueId?: number | string };
}

/**
 * Everyone on the friends list, with whatever party they are broadcasting.
 *
 * The party arrives as a JSON *string* inside `lol.pty` — presence data, not a
 * typed field — so it is parsed defensively: a friend whose payload is malformed
 * should still show up as a friend rather than taking the whole list down.
 *
 * `isPartyOpen` inside it is the bit that matters. An open party can be joined
 * by party id without an invite; a closed one cannot, and offering a Join button
 * for it would just produce an error.
 */
export async function listFriends(lcu: LcuClient): Promise<Friend[]> {
  const raw = await lcu.get<RawFriend[]>("/lol-chat/v1/friends");

  return raw
    .filter((friend) => Boolean(friend.puuid))
    .map((friend) => {
      let party: Friend["party"] = null;
      if (friend.lol?.pty) {
        try {
          const parsed = JSON.parse(friend.lol.pty) as {
            partyId?: string;
            isPartyOpen?: boolean;
            queueId?: number | string;
            maxPlayers?: number;
            summoners?: unknown[];
          };
          if (parsed.partyId) {
            party = {
              partyId: parsed.partyId,
              isOpen: Boolean(parsed.isPartyOpen),
              queueId: Number(parsed.queueId ?? 0) || 0,
              queueName: "",
              players: Array.isArray(parsed.summoners) ? parsed.summoners.length : 0,
              maxPlayers: parsed.maxPlayers ?? 0,
            };
          }
        } catch {
          /* presence is best-effort; a bad payload just means "no party" */
        }
      }

      const tag = friend.gameTag ? `#${friend.gameTag}` : "";
      return {
        puuid: friend.puuid!,
        name: `${friend.gameName || friend.name || "Unknown"}${tag}`,
        availability: friend.availability ?? "offline",
        status: friendStatus(friend, party),
        // Coerced, because presence sends it as a string and a number-keyed
        // cache misses silently — every mode showed as "Queue 420".
        queueId: Number(friend.lol?.queueId ?? 0) || 0,
        queueName: "",
        // Friends on VALORANT or the mobile app appear here too, and their
        // parties are not ones a League client can join.
        playingLeague: (friend.product ?? "") === "league_of_legends",
        statusMessage: friend.statusMessage ?? "",
        profileIconId: friend.icon ?? 0,
        groupId: friend.displayGroupId ?? 0,
        groupName: friendGroupLabel(friend.displayGroupName ?? ""),
        party,
      };
    });
}

/**
 * Which bucket a friend belongs in.
 *
 * Order matters, and it is not the order you would guess. `availability` cannot
 * lead: every friend in a game reports "dnd", which says nothing about whether
 * they are playing. `lol.gameStatus` is what the client's own list reads, so
 * that decides the game states, and the rest fall out from where they are logged
 * in — measured against a live list: 13 inGame, 1 championSelect, 2 outOfGame,
 * 8 on the mobile app, 1 in VALORANT, 159 offline.
 */
function friendStatus(friend: RawFriend, party: Friend["party"]): FriendStatus {
  if ((friend.availability ?? "offline") === "offline") return "offline";
  // The mobile app reports no game status at all, so it has to be caught first.
  if (friend.availability === "mobile") return "mobile";
  if ((friend.product ?? "") !== "league_of_legends") return "otherGame";

  const gameStatus = friend.lol?.gameStatus ?? "";
  if (gameStatus === "inGame") return "inGame";
  if (gameStatus === "championSelect") return "championSelect";
  // A lobby is only worth calling out when they are advertising the party.
  if (party) return "inParty";
  return "online";
}

/**
 * Sends a friend request to a Riot ID.
 *
 * Two steps, because the chat service wants a puuid and nobody knows their
 * friends by puuid: the alias resolver turns "Name#TAG" into an account first.
 * A name that does not exist comes back as an empty array rather than an error,
 * which is why that case is checked explicitly.
 */
export async function addFriend(
  lcu: LcuClient,
  gameName: string,
  tagLine: string,
): Promise<string> {
  const matches = await lcu.post<{ puuid?: string; gameName?: string; tagLine?: string }[]>(
    "/lol-summoner/v1/summoners/aliases",
    [{ gameName, tagLine }],
  );

  const found = matches?.find((match) => match.puuid);
  if (!found?.puuid) {
    throw new Error(`No player called ${gameName}#${tagLine}.`);
  }

  await lcu.post("/lol-chat/v2/friend-requests", {
    puuid: found.puuid,
    direction: "out",
  });
  return `${found.gameName ?? gameName}#${found.tagLine ?? tagLine}`;
}

/**
 * Invites friends into the lobby you are already in.
 *
 * The client takes an array, so several people go out in one call. Either a
 * puuid or a summoner id identifies the target; puuid is what the friends list
 * hands over, so that is what this uses.
 */
export async function inviteToLobby(lcu: LcuClient, puuids: string[]): Promise<void> {
  if (puuids.length === 0) return;
  await lcu.post(
    "/lol-lobby/v2/lobby/invitations",
    puuids.map((toPuuid) => ({ toPuuid })),
  );
}


// --- Friend groups ---------------------------------------------------------

/** One of the client's own friend groups, as its social panel shows them. */
export interface FriendGroup {
  id: number;
  name: string;
  /** The client's own ordering; lower sorts first. */
  priority: number;
  collapsed: boolean;
}

interface RawFriendGroup {
  id?: number;
  name?: string;
  priority?: number;
  collapsed?: boolean;
  isMetaGroup?: boolean;
}

/**
 * The client's friend groups, in the order the client itself lists them.
 *
 * `priority` is the client's ordering, so that is what this sorts on rather than
 * imposing one. The default group ships with the literal name `**Default`, which
 * is a placeholder the client localises on screen and nobody wants to read, so it
 * gets a sensible label here.
 */
export async function listFriendGroups(lcu: LcuClient): Promise<FriendGroup[]> {
  const raw = await lcu.get<RawFriendGroup[]>("/lol-chat/v1/friend-groups");
  return raw
    .filter((group) => group.id !== undefined && !group.isMetaGroup)
    .map((group) => ({
      id: group.id!,
      name: friendGroupLabel(group.name ?? ""),
      priority: group.priority ?? 0,
      collapsed: Boolean(group.collapsed),
    }))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

/** `**Default` is the client's placeholder for the ungrouped bucket. */
export function friendGroupLabel(name: string): string {
  return name === "**Default" || name === "" ? "Ungrouped" : name;
}

export async function createFriendGroup(lcu: LcuClient, name: string): Promise<void> {
  await lcu.post("/lol-chat/v1/friend-groups", { name: name.trim() });
}

export async function renameFriendGroup(
  lcu: LcuClient,
  id: number,
  name: string,
): Promise<void> {
  await lcu.put(`/lol-chat/v1/friend-groups/${id}`, { id, name: name.trim() });
}

export async function deleteFriendGroup(lcu: LcuClient, id: number): Promise<void> {
  await lcu.request("DELETE", `/lol-chat/v1/friend-groups/${id}`);
}

/**
 * Moves a friend into a group.
 *
 * The route takes a whole friend resource rather than a patch, so the current one
 * is read and handed back with only the group changed — sending a partial object
 * would blank out everything left out of it, including the note you wrote about
 * them.
 *
 * The path segment is not the puuid. `GET /lol-chat/v1/friends/{puuid}` answers
 * 404 \"Friend Not Found\" — the route wants the friend's `id` field instead,
 * which is the puuid with the platform appended (`<puuid>@eu1.pvp.net`). That is
 * only available from the list endpoint, so a friend is looked up there first.
 */
export async function moveFriendToGroup(
  lcu: LcuClient,
  puuid: string,
  groupId: number,
): Promise<void> {
  const friends = await lcu.get<Record<string, unknown>[]>("/lol-chat/v1/friends");
  const friend = friends.find((row) => row.puuid === puuid);
  if (!friend?.id) {
    throw new Error("That friend is not on your list anymore.");
  }

  await lcu.put(`/lol-chat/v1/friends/${encodeURIComponent(String(friend.id))}`, {
    ...friend,
    groupId,
  });
}
