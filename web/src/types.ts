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

export interface LobbyPositions {
  first: PositionPreference;
  second: PositionPreference;
  selectable: boolean;
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
  | { type: "alert"; kind: "ready-check" | "pick-turn" | "ban-turn"; message: string }
  | { type: "error"; message: string };
