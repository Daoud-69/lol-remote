import type {
  AutomationPatch,
  AutomationSettings,
  Champion,
  LobbyPositions,
  PositionPreference,
  RecommendedRunePage,
  RuneCatalog,
  Skin,
  StoredRunePage,
  SummonerSpell,
} from "../types";

export interface Connection {
  host: string;
  port: number;
  code: string;
}

export function baseUrl(connection: Connection): string {
  return `http://${connection.host}:${connection.port}`;
}

/** The agent's default, used when a pairing link leaves the port implicit. */
const DEFAULT_PORT = 8777;

/**
 * Reads a pairing link — `http://192.168.1.20:8777/?code=123456` — into a
 * connection.
 *
 * This is the other half of `pairingUrl()` in the agent, and it has two
 * callers: the QR scanner in the app, and this page's own address bar when a
 * phone camera opened the link directly. Deliberately strict, since anything
 * it accepts gets dialled and handed a pairing code.
 */
export function parsePairingUrl(text: string): Connection | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;

  const code = url.searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) return null;

  const port = url.port ? Number(url.port) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  return { host: url.hostname, port, code };
}

// Vite's own dev/preview servers (npm run dev / vite preview) — if the page
// loaded from one of those, it's a standalone checkout, not the agent serving
// its own build, so its host and port are Vite's rather than the agent's.
const STANDALONE_DEV_PORTS = new Set(["5173", "4173"]);

export function agentServedThisPage(): boolean {
  return !STANDALONE_DEV_PORTS.has(window.location.port);
}

/**
 * The pairing link this page was opened with, if a phone camera scanned the
 * agent's QR to get here. Null when the page was reached any other way.
 */
export function pairingLinkFromLocation(): Connection | null {
  return agentServedThisPage() ? parsePairingUrl(window.location.href) : null;
}

export function sameConnection(a: Connection | null, b: Connection | null): boolean {
  return a?.host === b?.host && a?.port === b?.port && a?.code === b?.code;
}

export function socketUrl(connection: Connection): string {
  return `ws://${connection.host}:${connection.port}/ws?code=${encodeURIComponent(connection.code)}`;
}

/** Asset URLs, proxied through the agent straight from the League client — no Data Dragon, never stale. */
export function championIconUrl(connection: Connection, championId: number): string {
  return (
    `${baseUrl(connection)}/api/asset/lol-game-data/assets/v1/champion-icons/` +
    `${championId}.png?code=${encodeURIComponent(connection.code)}`
  );
}

/** Spell icons don't live at a predictable path — each spell carries its own `iconPath` from the catalog. */
export function spellIconUrl(connection: Connection, iconPath: string): string {
  return `${baseUrl(connection)}/api/asset${iconPath}?code=${encodeURIComponent(connection.code)}`;
}

/** Splash art doesn't live at a predictable path either — each skin carries its own `splashPath` from the catalog. */
export function skinSplashUrl(connection: Connection, splashPath: string): string {
  return `${baseUrl(connection)}/api/asset${splashPath}?code=${encodeURIComponent(connection.code)}`;
}

/** Perk and style icons carry their own path, same as spells and splashes. */
export function perkIconUrl(connection: Connection, iconPath: string): string {
  return `${baseUrl(connection)}/api/asset${iconPath}?code=${encodeURIComponent(connection.code)}`;
}

export function profileIconUrl(connection: Connection, profileIconId: number): string {
  return (
    `${baseUrl(connection)}/api/asset/lol-game-data/assets/v1/profile-icons/` +
    `${profileIconId}.jpg?code=${encodeURIComponent(connection.code)}`
  );
}

class ApiError extends Error {}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError("The agent did not respond.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function call<T>(connection: Connection, path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(
    `${baseUrl(connection)}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.code}`,
        ...init?.headers,
      },
    },
    8000,
  );

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error ?? `Request failed (${response.status})`;
    throw new ApiError(message);
  }
  return payload as T;
}

function post<T>(connection: Connection, path: string, body?: unknown) {
  return call<T>(connection, path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Confirms an agent is listening, before we save the connection. */
export async function ping(host: string, port: number): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`http://${host}:${port}/api/ping`, {}, 4000);
    if (!response.ok) return false;
    const body = (await response.json()) as { service?: string };
    return body.service === "lol-remote-agent";
  } catch {
    return false;
  }
}

export async function verify(connection: Connection): Promise<boolean> {
  try {
    await call(connection, "/api/state");
    return true;
  } catch {
    return false;
  }
}

export const api = {
  accept: (c: Connection) => post<{ ok: true }>(c, "/api/accept"),
  decline: (c: Connection) => post<{ ok: true }>(c, "/api/decline"),

  select: (c: Connection, championId: number, lock: boolean) =>
    post<{ ok: true }>(c, "/api/select", { championId, lock }),

  setSpells: (c: Connection, spell1Id: number, spell2Id: number) =>
    post<{ ok: true }>(c, "/api/spells", { spell1Id, spell2Id }),

  setSkin: (c: Connection, skinId: number) => post<{ ok: true }>(c, "/api/skin", { skinId }),

  benchSwap: (c: Connection, championId: number) => post<{ ok: true }>(c, "/api/bench-swap", { championId }),

  startQueue: (c: Connection) => post<{ ok: true }>(c, "/api/queue/start"),
  stopQueue: (c: Connection) => post<{ ok: true }>(c, "/api/queue/stop"),

  setAutomation: (c: Connection, patch: AutomationPatch) =>
    post<AutomationSettings>(c, "/api/automation", patch),

  setPositions: (c: Connection, first: PositionPreference, second: PositionPreference) =>
    post<LobbyPositions | null>(c, "/api/positions", { first, second }),

  champions: (c: Connection) => call<Champion[]>(c, "/api/champions"),
  spells: (c: Connection) => call<SummonerSpell[]>(c, "/api/spells"),
  skins: (c: Connection, championId: number) => call<Skin[]>(c, `/api/skins/${championId}`),

  runeCatalog: (c: Connection) => call<RuneCatalog>(c, "/api/runes/catalog"),
  runePages: (c: Connection) => call<StoredRunePage[]>(c, "/api/runes/pages"),

  recommendedRunes: (c: Connection, championId: number, position: string) =>
    call<RecommendedRunePage[]>(
      c,
      `/api/runes/recommended/${championId}?position=${encodeURIComponent(position || "NONE")}`,
    ),

  clearRunePage: (c: Connection, championId: number) =>
    call<AutomationSettings>(c, `/api/runes/${championId}`, { method: "DELETE" }),
};
