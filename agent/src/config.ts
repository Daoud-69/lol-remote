import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { POSITIONS, type AutomationSettings, type Position, type RolePreset } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".lol-remote");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export const SERVER_PORT = Number(process.env.LOL_REMOTE_PORT ?? 8777);

interface StoredConfig {
  pairingCode: string;
  automation: AutomationSettings;
  pushTokens: string[];
}

function emptyRolePresets(): Record<Position, RolePreset> {
  const presets = {} as Record<Position, RolePreset>;
  for (const position of POSITIONS) {
    presets[position] = { championIds: [], spell1Id: 0, spell2Id: 0 };
  }
  return presets;
}

const DEFAULT_AUTOMATION: AutomationSettings = {
  autoAccept: false,
  autoAcceptDelayMs: 1500,
  primaryPosition: "UNSELECTED",
  secondaryPosition: "UNSELECTED",
  rolePresets: emptyRolePresets(),
  fallbackChampionIds: [],
  autoPickLock: false,
  declarePickIntent: true,
  banChampionIds: [],
  autoBanLock: true,
  protectTeammatePicks: true,
  autoSpell1Id: 0,
  autoSpell2Id: 0,
  runePages: {},
  applyRunes: false,
  panicLockAtSeconds: 3,
};

/**
 * Config written before per-role presets existed stored a single auto-pick and
 * auto-ban champion. Fold those into the new lists rather than silently
 * dropping settings someone already tuned.
 */
interface LegacyAutomation {
  autoPickChampionId?: number;
  autoBanChampionId?: number;
}

function migrate(stored: Partial<AutomationSettings> & LegacyAutomation): AutomationSettings {
  const { autoPickChampionId, autoBanChampionId, ...rest } = stored;

  const merged: AutomationSettings = {
    ...DEFAULT_AUTOMATION,
    ...rest,
    // Nested objects need their own merge — a spread would let a partial
    // rolePresets from disk drop roles the defaults define.
    rolePresets: { ...emptyRolePresets(), ...rest.rolePresets },
    runePages: { ...rest.runePages },
  };

  if (autoPickChampionId && merged.fallbackChampionIds.length === 0) {
    merged.fallbackChampionIds = [autoPickChampionId];
  }
  if (autoBanChampionId && merged.banChampionIds.length === 0) {
    merged.banChampionIds = [autoBanChampionId];
  }

  return merged;
}

function read(): StoredConfig {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Partial<StoredConfig>;
    return {
      pairingCode: parsed.pairingCode ?? generatePairingCode(),
      automation: migrate(parsed.automation ?? {}),
      pushTokens: parsed.pushTokens ?? [],
    };
  } catch {
    return {
      pairingCode: generatePairingCode(),
      automation: DEFAULT_AUTOMATION,
      pushTokens: [],
    };
  }
}

function write(config: StoredConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

let cache: StoredConfig | null = null;
function config(): StoredConfig {
  if (!cache) {
    cache = read();
    write(cache); // Persist a freshly generated pairing code.
  }
  return cache;
}

function generatePairingCode(): string {
  return String(randomInt(100000, 1000000));
}

export function getPairingCode(): string {
  return config().pairingCode;
}

export function regeneratePairingCode(): string {
  const next = config();
  next.pairingCode = generatePairingCode();
  next.pushTokens = []; // Old phones lose access along with the old code.
  write(next);
  return next.pairingCode;
}

export function loadAutomation(): AutomationSettings {
  return config().automation;
}

export function saveAutomation(automation: AutomationSettings): void {
  const next = config();
  next.automation = automation;
  write(next);
}

export function getPushTokens(): string[] {
  return config().pushTokens;
}

export function addPushToken(token: string): void {
  const next = config();
  if (next.pushTokens.includes(token)) return;
  next.pushTokens = [...next.pushTokens, token].slice(-5);
  write(next);
}

/** Every non-internal IPv4 address, so the agent can print where to connect. */
export function localAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface): iface is os.NetworkInterfaceInfo => Boolean(iface))
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}
