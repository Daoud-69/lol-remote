/** Mirrors agent/src/types.ts — the agent↔frontend contract. */

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
  state: string;
  playerResponse: string;
  timer: number;
}

export type ActionType = "pick" | "ban" | "ten_bans_reveal";

export interface MyAction {
  id: number;
  type: ActionType;
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
  /** Our pick action, in progress or not — 0 if we have none. */
  myPickActionId: number;
  myTeam: TeammateSlot[];
  theirTeam: TeammateSlot[];
  bans: { myTeamBans: number[]; theirTeamBans: number[] };
  myAssignedPosition: string;
  autofilled: boolean;
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
  pickable?: boolean;
  bannable?: boolean;
}

export interface SummonerSpell {
  id: number;
  name: string;
  description: string;
  iconPath: string;
}

export interface Skin {
  id: number;
  name: string;
  championId: number;
  unlocked: boolean;
  isBase: boolean;
  splashPath: string;
  chromas: { id: number; name: string; colors: string[]; unlocked: boolean }[];
}

export type Position = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

export const POSITIONS: Position[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

export type PositionPreference = Position | "FILL" | "UNSELECTED";

export interface GameQueue {
  id: number;
  name: string;
  description: string;
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

/** One of the client’s own friend groups. */
export interface FriendGroup {
  id: number;
  name: string;
  priority: number;
  collapsed: boolean;
}

/** Where a friend is, resolved by the agent from three separate LCU fields. */
export type FriendStatus =
  | "inGame"
  | "championSelect"
  | "inParty"
  | "online"
  | "mobile"
  | "otherGame"
  | "offline";

/** A friend, plus the party they are advertising. */
export interface Friend {
  puuid: string;
  name: string;
  availability: string;
  status: FriendStatus;
  playingLeague: boolean;
  /** What they are queued for or playing; 0 when not applicable. */
  queueId: number;
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
    queueName: string;
    players: number;
    maxPlayers: number;
  } | null;
}

/** A public custom lobby, as the client’s browser lists them. */
export interface CustomGame {
  /** The only field that identifies a lobby — every row reports id: 0. */
  partyId: string;
  name: string;
  owner: string;
  mapId: number;
  map: string;
  hasPassword: boolean;
  players: number;
  maxPlayers: number;
  spectators: number;
  maxSpectators: number;
}

export interface LobbyPositions {
  first: PositionPreference;
  second: PositionPreference;
  selectable: boolean;
  queueId: number;
  /** Resolved mode name, e.g. "ARAM"; empty outside a lobby. */
  queueName: string;
}

/** Which fallback supplies runes for a champion you never configured. */
export type RuneSourceId = "none" | "client";

/** One selectable rune source, as the agent advertises it. */
export interface RuneSourceInfo {
  id: RuneSourceId;
  label: string;
  help: string;
}

export interface RunePage {
  primaryStyleId: number;
  secondaryStyleId: number;
  /** keystone, 3 primary minors, 2 secondary minors, 3 stat shards. */
  selectedPerkIds: number[];
}

export interface RolePreset {
  championIds: number[];
  spell1Id: number;
  spell2Id: number;
}

export interface AutomationSettings {
  autoAccept: boolean;
  autoAcceptDelayMs: number;
  primaryPosition: PositionPreference;
  secondaryPosition: PositionPreference;
  rolePresets: Record<Position, RolePreset>;
  fallbackChampionIds: number[];
  autoPickLock: boolean;
  declarePickIntent: boolean;
  banChampionIds: number[];
  autoBanLock: boolean;
  protectTeammatePicks: boolean;
  autoSpell1Id: number;
  autoSpell2Id: number;
  runePages: Record<number, RunePage>;
  applyRunes: boolean;
  /** Where a page comes from for a champion with none saved above. */
  runeSource: RuneSourceId;
  panicLockAtSeconds: number;
}

/**
 * A settings update. `rolePresets` and `runePages` merge per key on the agent,
 * so a patch names only what it changes.
 */
export type AutomationPatch = Partial<
  Omit<AutomationSettings, "rolePresets" | "runePages">
> & {
  rolePresets?: Partial<Record<Position, RolePreset>>;
  runePages?: Record<number, RunePage>;
};

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

export interface RecommendedRunePage extends RunePage {
  recommendationId: string;
  position: string;
  keystoneId: number;
  keystoneName: string;
  keystoneIconPath: string;
  summonerSpellIds: number[];
}

/** One of the player's own saved pages, offered as a starting point. */
export interface StoredRunePage extends RunePage {
  id: number;
  name: string;
  current: boolean;
  isDeletable: boolean;
}

export interface AgentState {
  connectedToClient: boolean;
  summoner: { displayName: string; summonerId: number; profileIconId: number } | null;
  phase: GameflowPhase;
  readyCheck: ReadyCheckState | null;
  champSelect: ChampSelectState | null;
  lobby: LobbyPositions | null;
  automation: AutomationSettings;
  log: { at: number; message: string }[];
}

export type ServerMessage =
  | { type: "state"; state: AgentState }
  | {
      type: "alert";
      kind: "ready-check" | "pick-turn" | "ban-turn" | "game-start";
      message: string;
    }
  | { type: "error"; message: string };
