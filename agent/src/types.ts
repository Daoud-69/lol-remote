/**
 * The contract between the agent and the phone. Keep this file in sync with
 * app/src/types.ts — it is duplicated rather than shared so that Expo's bundler
 * does not have to reach outside the app directory.
 */

export type GameflowPhase =
  | "None"
  | "Lobby"
  | "Matchmaking"
  | "ReadyCheck"
  | "ChampSelect"
  | "GameStart"
  | "InProgress"
  | "Reconnect"
  | "WaitingForStats"
  | "PreEndOfGame"
  | "EndOfGame"
  | "TerminatedInError";

export interface ReadyCheckState {
  /** "InProgress" while the accept popup is showing. */
  state: string;
  /** "None" until we (or the player) answer. */
  playerResponse: string;
  /** Seconds elapsed; the client gives ~12.5s to answer. */
  timer: number;
}

export type ActionType = "pick" | "ban" | "ten_bans_reveal";

export interface MyAction {
  id: number;
  type: ActionType;
  /** True when it is our turn right now — the only time locking works. */
  isInProgress: boolean;
  completed: boolean;
  championId: number;
}

export interface TeammateSlot {
  cellId: number;
  championId: number;
  championPickIntent: number;
  assignedPosition: string;
  spell1Id: number;
  spell2Id: number;
  isLocalPlayer: boolean;
}

/**
 * Which of the two things a swap trades. The client models them identically —
 * same contract, same four verbs — and differs only in the route segment.
 */
export type SwapKind = "position" | "pickOrder";

/**
 * Where a swap has got to, spelled as the client spells it.
 *
 * Only three of these are worth a button. `AVAILABLE` is an offer you could
 * make, `SENT` is one you are waiting on, and `RECEIVED` is the one that
 * matters most — a teammate is asking you, and it expires. The rest are either
 * settled (`ACCEPTED`, `DECLINED`, `CANCELLED`) or not offerable (`BUSY` while
 * that player is mid-swap with someone else, `INVALID` where the trade makes
 * no sense), and all of them are reported rather than filtered so the phone
 * can say why a teammate is not swappable instead of silently omitting them.
 */
export type SwapState =
  | "AVAILABLE"
  | "SENT"
  | "RECEIVED"
  | "BUSY"
  | "INVALID"
  | "ACCEPTED"
  | "DECLINED"
  | "CANCELLED";

/** One possible trade with one teammate. */
export interface TeamSwap {
  /** What the request/accept/decline/cancel routes are keyed by. */
  id: number;
  /** The teammate on the other side, matched against `myTeam`. */
  cellId: number;
  state: SwapState;
  kind: SwapKind;
}

/** The four things you can do to a swap, and the route segment each maps to. */
export type SwapAction = "request" | "accept" | "decline" | "cancel";

export interface ChampSelectState {
  phase: string;
  timeLeftMs: number;
  localPlayerCellId: number;
  myAction: MyAction | null;
  /**
   * Our pick action, whether or not it is in progress yet. During planning the
   * ban is what `myAction` reports, but declaring an intended champion means
   * patching the pick — so it needs to be reachable separately. 0 if we have none.
   */
  myPickActionId: number;
  myTeam: TeammateSlot[];
  theirTeam: TeammateSlot[];
  bans: { myTeamBans: number[]; theirTeamBans: number[] };
  /** Role and pick-order trades with teammates, both kinds in one list. */
  swaps: TeamSwap[];
  /** Uppercased role the client assigned us, "" in modes without roles. */
  myAssignedPosition: string;
  /**
   * True when the assigned role is neither of the two we asked for — the case
   * the per-role pick lists exist to survive.
   */
  autofilled: boolean;
  /** ARAM/Swiftplay reroll bench. */
  benchEnabled: boolean;
  benchChampionIds: number[];
  selection: {
    championId: number;
    selectedSkinId: number;
    spell1Id: number;
    spell2Id: number;
    wardSkinId: number;
  } | null;
}

export interface Champion {
  id: number;
  name: string;
  alias: string;
  /** True when the champion is currently pickable by us. */
  pickable?: boolean;
  bannable?: boolean;
  /**
   * True when this account can actually play the champion right now — owned
   * outright or in the current free rotation.
   *
   * Undefined rather than false when the client would not say, so a caller can
   * tell "not playable" from "not known" and show everything rather than an
   * empty grid.
   */
  playable?: boolean;
  /** Playable only because it is in this week's rotation, not because it is owned. */
  freeToPlay?: boolean;
}

export interface SummonerSpell {
  id: number;
  name: string;
  description: string;
  /** Path to the icon, relative to the client's own asset server — not a predictable /v1/summoner-spells/{id} URL. */
  iconPath: string;
}

export interface Skin {
  id: number;
  name: string;
  championId: number;
  /** Owned, or free via a loot/rental grant. */
  unlocked: boolean;
  isBase: boolean;
  /** Path to the splash art, relative to the client's own asset server — not a predictable URL. */
  splashPath: string;
  chromas: { id: number; name: string; colors: string[]; unlocked: boolean }[];
}

/** The five Summoner's Rift roles, spelled the way the client spells them. */
export type Position = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

export const POSITIONS: Position[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** What the lobby's role selector accepts, on top of the five real roles. */
export type PositionPreference = Position | "FILL" | "UNSELECTED";

/**
 * One playable mode, as the client currently advertises it.
 *
 * Read live from the client rather than listed here: Riot rotates modes in and
 * out constantly, so a hardcoded list would be wrong within weeks.
 */
export interface GameQueue {
  id: number;
  /** What the client’s own button says, e.g. "Draft Pick", "ARAM", "Arena". */
  name: string;
  description: string;
  /** "CLASSIC", "ARAM", "CHERRY" (Arena), "TFT", … — used to group the list. */
  gameMode: string;
  category: string;
  isRanked: boolean;
  /** Played against bots. Decided from the queue type, not the category,
   *  which the client mislabels for Classic Rift. */
  isBots: boolean;
  /** Built through the custom-lobby call, not by queue id. */
  isCustom: boolean;
  teamSize: number;
  /** Heading to file this under, in the client’s own words ("ARAM", "Classic Rift"). */
  group: string;
}

/**
 * One of Swiftplay's pre-picked champions, chosen in the lobby rather than in
 * champ select.
 *
 * The client calls these "player slots" and stores a whole loadout per slot —
 * champion, the role you want to play it in, both spells, a skin and a rune
 * page. The rune page is a JSON *string* inside the slot and is not modelled
 * here: nothing on the phone edits it, and carrying it through the contract
 * only to hand it back unchanged would invite it being dropped on a write.
 */
export interface LobbySlot {
  championId: number;
  /** "TOP", "UTILITY", … or "" when the slot has no role attached. */
  positionPreference: string;
  spell1Id: number;
  spell2Id: number;
  skinId: number;
  /**
   * The slot's rune page, re-spelled into the same shape champ select uses.
   *
   * The client stores it as a JSON string under different field names
   * (`perkStyle`, `perkSubStyle`, `perkIds`), which is a detail of how a lobby
   * happens to serialise things rather than something worth exporting — the
   * phone already has an editor for `RunePage`, and it should not need a second
   * one to edit the same nine perks. Null when the slot has no page or the
   * string does not parse.
   */
  perks: RunePage | null;
}

/** What the phone may change about one slot; anything omitted is left alone. */
export interface LobbySlotPatch {
  championId?: number;
  positionPreference?: string;
  spell1Id?: number;
  spell2Id?: number;
  skinId?: number;
  perks?: RunePage;
}

export interface LobbyPositions {
  first: PositionPreference;
  second: PositionPreference;
  /** False in modes with no role selector (ARAM, Arena, most customs). */
  selectable: boolean;
  /** Which mode this lobby is for; 0 when the client did not say. */
  queueId: number;
  /** Resolved mode name, e.g. "ARAM"; empty outside a lobby. */
  queueName: string;
  /**
   * Swiftplay's pre-picked champions. Empty in every mode that does not offer
   * them, which is how the phone decides whether to show the picker at all —
   * the client advertises no flag for it.
   */
  slots: LobbySlot[];
}

/**
 * Which fallback supplies runes for a champion you never configured.
 *
 * A string union rather than a boolean because the client's recommendation is
 * the first source, not the only possible one — see `runeSource.ts`.
 */
export type RuneSourceId = "none" | "client";

/** One selectable rune source, as the phone's settings picker lists them. */
export interface RuneSourceInfo {
  id: RuneSourceId;
  label: string;
  help: string;
}

/**
 * A rune page as the client stores it: two styles plus nine perk ids, ordered
 * keystone, three primary minors, two secondary minors, three stat shards.
 */
export interface RunePage {
  primaryStyleId: number;
  secondaryStyleId: number;
  selectedPerkIds: number[];
}

/**
 * What to do when we end up in a given role. The champion list is ordered — we
 * take the first entry that is still legal, so a banned or taken first choice
 * falls through to the second and third instead of stalling.
 */
export interface RolePreset {
  championIds: number[];
  /** 0 = leave the slot alone and use the global preset instead. */
  spell1Id: number;
  spell2Id: number;
}

export interface AutomationSettings {
  /** Auto-accept the ready check the moment it appears. */
  autoAccept: boolean;
  /** Wait this long before accepting, so you can still decline manually. */
  autoAcceptDelayMs: number;

  /** Pushed to the lobby's role selector when the phone changes them. */
  primaryPosition: PositionPreference;
  secondaryPosition: PositionPreference;

  /**
   * Per-role pick lists. The agent picks from the list matching the role the
   * client actually assigned, which is what makes an autofill land on a
   * champion you can play rather than on your mid-lane main.
   */
  rolePresets: Record<Position, RolePreset>;
  /** Used when there is no assigned role at all — ARAM, blind pick, customs. */
  fallbackChampionIds: number[];
  autoPickLock: boolean;
  /** Declare the intended champion during the planning phase, before bans. */
  declarePickIntent: boolean;

  /** Ordered ban preferences; the first one still bannable wins. */
  banChampionIds: number[];
  autoBanLock: boolean;
  /** Never ban a champion a teammate has already declared. */
  protectTeammatePicks: boolean;

  /** Applied on entering champ select. 0 = leave alone. */
  autoSpell1Id: number;
  autoSpell2Id: number;

  /** Rune page to apply per champion id, once that champion is locked. */
  runePages: Record<number, RunePage>;
  applyRunes: boolean;
  /**
   * Where to get a page for a champion with none saved above. "none" leaves
   * those champions alone, which is what this did before there were sources.
   */
  runeSource: RuneSourceId;

  /** Seconds of remaining turn time at which we force the lock as a safety net. */
  panicLockAtSeconds: number;
}

/**
 * What the phone is allowed to send to `/api/automation`.
 *
 * The two record-valued settings merge per key rather than wholesale, so a
 * patch carries only the roles or champions it means to change — sending a
 * full `Record<Position, …>` just to edit one role would race every other tab.
 */
export type AutomationPatch = Partial<
  Omit<AutomationSettings, "rolePresets" | "runePages">
> & {
  rolePresets?: Partial<Record<Position, RolePreset>>;
  runePages?: Record<number, RunePage>;
};

// --- Rune catalog ----------------------------------------------------------

export interface PerkSlot {
  type: "kKeyStone" | "kMixedRegularSplashable" | "kStatMod";
  perkIds: number[];
}

export interface PerkStyle {
  id: number;
  name: string;
  iconPath: string;
  allowedSubStyles: number[];
  slots: PerkSlot[];
}

export interface Perk {
  id: number;
  name: string;
  shortDesc: string;
  iconPath: string;
  styleId: number;
  slotType: string;
}

export interface RuneCatalog {
  styles: PerkStyle[];
  perks: Perk[];
}

/** One of the client's own suggestions for a champion in a role. */
export interface RecommendedRunePage extends RunePage {
  /** Stable id from the client, used only as a React key. */
  recommendationId: string;
  position: string;
  keystoneId: number;
  keystoneName: string;
  keystoneIconPath: string;
  summonerSpellIds: number[];
}

export interface AgentState {
  connectedToClient: boolean;
  summoner: { displayName: string; summonerId: number; profileIconId: number } | null;
  phase: GameflowPhase;
  readyCheck: ReadyCheckState | null;
  champSelect: ChampSelectState | null;
  /** Live role selector state, null outside a lobby. */
  lobby: LobbyPositions | null;
  automation: AutomationSettings;
  /** Human-readable trail of what the agent did, newest first. */
  log: { at: number; message: string }[];
}

/** Frames pushed from agent to phone over the WebSocket. */
export type ServerMessage =
  | { type: "state"; state: AgentState }
  | {
      type: "alert";
      kind: "ready-check" | "pick-turn" | "ban-turn" | "game-start";
      message: string;
    }
  | { type: "error"; message: string };
