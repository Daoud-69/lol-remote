import type { AutomationSettings, Champion, Skin, SummonerSpell } from "./types";

export interface Connection {
  host: string;
  port: number;
  code: string;
}

export function baseUrl(connection: Connection): string {
  return `http://${connection.host}:${connection.port}`;
}

export function socketUrl(connection: Connection): string {
  return `ws://${connection.host}:${connection.port}/ws?code=${encodeURIComponent(connection.code)}`;
}

/** Asset URL for a champion square, proxied through the agent. */
export function championIconUrl(connection: Connection, championId: number): string {
  return (
    `${baseUrl(connection)}/api/asset/lol-game-data/assets/v1/champion-icons/` +
    `${championId}.png?code=${encodeURIComponent(connection.code)}`
  );
}

export function spellIconUrl(connection: Connection, spellId: number): string {
  return (
    `${baseUrl(connection)}/api/asset/lol-game-data/assets/v1/summoner-spells/` +
    `${spellId}.png?code=${encodeURIComponent(connection.code)}`
  );
}

/** Splash art used as the skin preview tile. */
export function skinSplashUrl(
  connection: Connection,
  championId: number,
  skinId: number,
): string {
  return (
    `${baseUrl(connection)}/api/asset/lol-game-data/assets/v1/champion-splashes/` +
    `${championId}/${skinId}.jpg?code=${encodeURIComponent(connection.code)}`
  );
}

class ApiError extends Error {}

/**
 * fetch with a deadline. Hermes does not ship `AbortSignal.timeout`, so the
 * controller is driven manually. The agent is one hop away on the LAN —
 * anything slower than this is a dead connection, and we would rather say so
 * than hang a button forever.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
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

async function call<T>(
  connection: Connection,
  path: string,
  init?: RequestInit,
): Promise<T> {
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
    const message =
      (payload as { error?: string } | null)?.error ?? `Request failed (${response.status})`;
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

/** Verifies the pairing code by making one authenticated request. */
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

  benchSwap: (c: Connection, championId: number) =>
    post<{ ok: true }>(c, "/api/bench-swap", { championId }),

  startQueue: (c: Connection) => post<{ ok: true }>(c, "/api/queue/start"),
  stopQueue: (c: Connection) => post<{ ok: true }>(c, "/api/queue/stop"),

  setAutomation: (c: Connection, patch: Partial<AutomationSettings>) =>
    post<AutomationSettings>(c, "/api/automation", patch),

  registerPushToken: (c: Connection, token: string) =>
    post<{ ok: true }>(c, "/api/push-token", { token }),

  champions: (c: Connection) => call<Champion[]>(c, "/api/champions"),
  spells: (c: Connection) => call<SummonerSpell[]>(c, "/api/spells"),
  skins: (c: Connection, championId: number) =>
    call<Skin[]>(c, `/api/skins/${championId}`),
};
