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

export interface AutomationSettings {
  autoAccept: boolean;
  autoAcceptDelayMs: number;
  autoPickChampionId: number;
  autoPickLock: boolean;
  autoBanChampionId: number;
  autoBanLock: boolean;
  autoSpell1Id: number;
  autoSpell2Id: number;
  panicLockAtSeconds: number;
}

export interface AgentState {
  connectedToClient: boolean;
  summoner: { displayName: string; summonerId: number; profileIconId: number } | null;
  phase: GameflowPhase;
  readyCheck: ReadyCheckState | null;
  champSelect: ChampSelectState | null;
  automation: AutomationSettings;
  log: { at: number; message: string }[];
}

export type ServerMessage =
  | { type: "state"; state: AgentState }
  | { type: "alert"; kind: "ready-check" | "pick-turn" | "ban-turn"; message: string }
  | { type: "error"; message: string };
