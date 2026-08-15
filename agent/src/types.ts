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
  myTeam: TeammateSlot[];
  theirTeam: TeammateSlot[];
  bans: { myTeamBans: number[]; theirTeamBans: number[] };
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
}

export interface Skin {
  id: number;
  name: string;
  championId: number;
  /** Owned, or free via a loot/rental grant. */
  unlocked: boolean;
  isBase: boolean;
  chromas: { id: number; name: string; colors: string[]; unlocked: boolean }[];
}

export interface AutomationSettings {
  /** Auto-accept the ready check the moment it appears. */
  autoAccept: boolean;
  /** Wait this long before accepting, so you can still decline manually. */
  autoAcceptDelayMs: number;
  /** Hover + lock this champion when it becomes our pick turn. 0 = off. */
  autoPickChampionId: number;
  autoPickLock: boolean;
  /** Ban this champion when it becomes our ban turn. 0 = off. */
  autoBanChampionId: number;
  autoBanLock: boolean;
  /** Applied on entering champ select. 0 = leave alone. */
  autoSpell1Id: number;
  autoSpell2Id: number;
  /** Seconds of remaining turn time at which we force the lock as a safety net. */
  panicLockAtSeconds: number;
}

export interface AgentState {
  connectedToClient: boolean;
  summoner: { displayName: string; summonerId: number; profileIconId: number } | null;
  phase: GameflowPhase;
  readyCheck: ReadyCheckState | null;
  champSelect: ChampSelectState | null;
  automation: AutomationSettings;
  /** Human-readable trail of what the agent did, newest first. */
  log: { at: number; message: string }[];
}

/** Frames pushed from agent to phone over the WebSocket. */
export type ServerMessage =
  | { type: "state"; state: AgentState }
  | { type: "alert"; kind: "ready-check" | "pick-turn" | "ban-turn"; message: string }
  | { type: "error"; message: string };
