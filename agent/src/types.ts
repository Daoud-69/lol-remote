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

export interface LobbyPositions {
  first: PositionPreference;
  second: PositionPreference;
  /** False in modes with no role selector (ARAM, Arena, most customs). */
  selectable: boolean;
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
  | { type: "alert"; kind: "ready-check" | "pick-turn" | "ban-turn"; message: string }
  | { type: "error"; message: string };
