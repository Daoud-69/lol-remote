import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { Session } from "./session.js";
import { addPushToken, getPairingCode, SERVER_PORT } from "./config.js";
import { sendPush } from "./push.js";
import {
  acceptReadyCheck,
  benchSwap,
  declineReadyCheck,
  describeLcuError,
  resolveAction,
  setSkin,
  setSpells,
  setWardSkin,
  startQueue,
  stopQueue,
} from "./lcu/actions.js";
import type { ServerMessage } from "./types.js";

export interface ServerHandle {
  getConnectedPhoneCount: () => number;
  /** True when a web/dist build was found and is being served at "/". */
  servingWebApp: boolean;
}

export interface StartServerOptions {
  /**
   * A built copy of web/dist, if present. Served at "/" on the same port as
   * the API, so the one address the agent already prints doubles as the link
   * to open in a phone's browser — no separate server to run or explain.
   */
  webDir?: string;
}

export async function startServer(
  session: Session,
  options: StartServerOptions = {},
): Promise<ServerHandle> {
  const app = express();
  app.use(express.json());

  // The phone is on the same LAN but a different origin; keep this permissive
  // since the pairing code, not the origin, is what actually gates access.
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    next();
  });
  app.options("*", (_req, res) => {
    res.sendStatus(204);
  });

  const servingWebApp = Boolean(
    options.webDir && existsSync(path.join(options.webDir, "index.html")),
  );
  if (servingWebApp) {
    app.use(express.static(options.webDir!));
  }

  /** Unauthenticated, so the app can confirm it found the agent before pairing. */
  app.get("/api/ping", (_req, res) => {
    res.json({ ok: true, service: "lol-remote-agent", version: 1 });
  });

  app.use("/api", requirePairing);

  app.get("/api/state", (_req, res) => {
    res.json(session.getState());
  });

  app.post("/api/push-token", (req, res) => {
    const token = String(req.body?.token ?? "");
    if (!token.startsWith("ExponentPushToken")) {
      res.status(400).json({ error: "That is not an Expo push token." });
      return;
    }
    addPushToken(token);
    res.json({ ok: true });
  });

  // --- Catalogs ------------------------------------------------------------

  app.get("/api/champions", async (_req, res) => {
    await run(res, async () => {
      const data = session.getGameData();
      const lcu = session.getClient();
      const champions = data.getChampions();

      // Pickable/bannable lists only exist during champ select.
      let pickable: Set<number> | null = null;
      let bannable: Set<number> | null = null;
      if (session.getState().phase === "ChampSelect") {
        const [p, b] = await Promise.all([
          lcu.get<number[]>("/lol-champ-select/v1/pickable-champion-ids").catch(() => null),
          lcu.get<number[]>("/lol-champ-select/v1/bannable-champion-ids").catch(() => null),
        ]);
        if (p) pickable = new Set(p);
        if (b) bannable = new Set(b);
      }

      return champions.map((champion) => ({
        ...champion,
        pickable: pickable ? pickable.has(champion.id) : undefined,
        bannable: bannable ? bannable.has(champion.id) : undefined,
      }));
    });
  });

  app.get("/api/spells", (_req, res) => {
    void run(res, async () => session.getGameData().getSpells());
  });

  app.get("/api/skins/:championId", (req, res) => {
    void run(res, async () => {
      const championId = Number(req.params.championId);
      const inChampSelect = session.getState().phase === "ChampSelect";
      return session.getGameData().getSkins(championId, inChampSelect);
    });
  });

  /**
   * Proxies client artwork so the phone renders icons without shipping its own
   * asset bundle or hitting a CDN.
   */
  app.get("/api/asset/*", (req, res) => {
    void (async () => {
      try {
        const endpoint = "/" + (req.params as Record<string, string>)[0];
        if (!endpoint.startsWith("/lol-game-data/assets/")) {
          res.status(403).json({ error: "Only game assets can be proxied." });
          return;
        }
        const { buffer, contentType } = await session.getClient().getBinary(endpoint);
        res.setHeader("Content-Type", contentType ?? "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.send(buffer);
      } catch (error) {
        res.status(404).json({ error: describeLcuError(error) });
      }
    })();
  });

  // --- Commands ------------------------------------------------------------

  app.post("/api/accept", (_req, res) => {
    void run(res, async () => {
      await acceptReadyCheck(session.getClient());
      session.log("Accepted the ready check from the phone.");
      return { ok: true };
    });
  });

  app.post("/api/decline", (_req, res) => {
    void run(res, async () => {
      await declineReadyCheck(session.getClient());
      session.log("Declined the ready check from the phone.");
      return { ok: true };
    });
  });

  /**
   * Hover or lock for the action currently in progress. The client is the
   * authority on whose turn it is, so we always resolve the action id from the
   * live session rather than trusting one the phone cached.
   */
  app.post("/api/select", (req, res) => {
    void run(res, async () => {
      const championId = Number(req.body?.championId);
      const lock = Boolean(req.body?.lock);
      if (!championId) throw new HttpError(400, "championId is required.");

      const action = session.getState().champSelect?.myAction;
      if (!action) throw new HttpError(409, "You have no pick or ban pending.");
      if (!action.isInProgress) {
        throw new HttpError(409, "It is not your turn yet — hovering is not allowed.");
      }

      await resolveAction(session.getClient(), action.id, championId, lock);
      const name = session.getGameData().championName(championId);
      session.log(`${lock ? "Locked" : "Hovered"} ${name} from the phone.`);
      await session.refreshAll();
      return { ok: true, action: action.type, championId, locked: lock };
    });
  });

  app.post("/api/spells", (req, res) => {
    void run(res, async () => {
      const spell1Id = Number(req.body?.spell1Id);
      const spell2Id = Number(req.body?.spell2Id);
      if (!spell1Id || !spell2Id) {
        throw new HttpError(400, "Both spell1Id and spell2Id are required.");
      }
      if (spell1Id === spell2Id) {
        throw new HttpError(400, "You cannot take the same spell twice.");
      }
      await setSpells(session.getClient(), spell1Id, spell2Id);
      session.log("Set summoner spells from the phone.");
      await session.refreshAll();
      return { ok: true };
    });
  });

  app.post("/api/skin", (req, res) => {
    void run(res, async () => {
      const skinId = Number(req.body?.skinId);
      if (!skinId) throw new HttpError(400, "skinId is required.");

      const select = session.getState().champSelect;
      if (!select?.selection?.championId) {
        throw new HttpError(409, "Lock in a champion before choosing a skin.");
      }
      await setSkin(session.getClient(), skinId);
      session.log("Set skin from the phone.");
      await session.refreshAll();
      return { ok: true };
    });
  });

  app.post("/api/ward-skin", (req, res) => {
    void run(res, async () => {
      const wardSkinId = Number(req.body?.wardSkinId);
      if (!wardSkinId) throw new HttpError(400, "wardSkinId is required.");
      await setWardSkin(session.getClient(), wardSkinId);
      return { ok: true };
    });
  });

  app.post("/api/bench-swap", (req, res) => {
    void run(res, async () => {
      const championId = Number(req.body?.championId);
      if (!championId) throw new HttpError(400, "championId is required.");
      await benchSwap(session.getClient(), championId);
      session.log(
        `Swapped to ${session.getGameData().championName(championId)} from the bench.`,
      );
      await session.refreshAll();
      return { ok: true };
    });
  });

  app.post("/api/queue/start", (_req, res) => {
    void run(res, async () => {
      await startQueue(session.getClient());
      session.log("Started matchmaking from the phone.");
      return { ok: true };
    });
  });

  app.post("/api/queue/stop", (_req, res) => {
    void run(res, async () => {
      await stopQueue(session.getClient());
      session.log("Stopped matchmaking from the phone.");
      return { ok: true };
    });
  });

  app.post("/api/automation", (req, res) => {
    void run(res, async () => session.updateAutomation(req.body ?? {}));
  });

  // --- Transport -----------------------------------------------------------

  // Plain HTTP: the pairing code is the actual access control (see README's
  // Security section), and a self-signed HTTPS cert bought nothing but a
  // scary browser warning and a phone/agent trust dance for a same-LAN
  // connection — not worth the friction for the common case.
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    if (url.searchParams.get("code") !== getPairingCode()) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  wss.on("connection", (ws: WebSocket) => {
    session.log("A phone connected.");
    send(ws, { type: "state", state: session.getState() });

    const keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 20000);

    ws.on("close", () => clearInterval(keepAlive));
  });

  const broadcast = (message: ServerMessage) => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) send(client, message);
    }
  };

  session.on("state", broadcast);
  session.on("alert", (message: ServerMessage) => {
    broadcast(message);
    if (message.type === "alert") {
      const title =
        message.kind === "ready-check" ? "Queue popped!" : "League of Legends";
      void sendPush(title, message.message);
    }
  });

  server.listen(SERVER_PORT, "0.0.0.0", () => {
    console.log(`[agent] Listening on port ${SERVER_PORT}`);
  });

  return { getConnectedPhoneCount: () => wss.clients.size, servingWebApp };
}

// --- Helpers ---------------------------------------------------------------

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function requirePairing(req: Request, res: Response, next: NextFunction): void {
  const provided =
    req.header("authorization")?.replace(/^Bearer\s+/i, "") ??
    (req.query.code as string | undefined);

  if (provided !== getPairingCode()) {
    res.status(401).json({ error: "Wrong pairing code." });
    return;
  }
  next();
}

/** Runs a handler, mapping thrown errors to a message the phone can display. */
async function run<T>(res: Response, handler: () => Promise<T>): Promise<void> {
  try {
    res.json(await handler());
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: describeLcuError(error) });
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}
