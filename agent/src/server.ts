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
  listCustomGames,
  listQueues,
  resolveAction,
  setSkin,
  setSpells,
  respondToSwap,
  setWardSkin,
  startQueue,
  stopQueue,
} from "./lcu/actions.js";
import { listPages, readCatalog, recommendedPages } from "./lcu/runes.js";
import { RUNE_SOURCES } from "./runeSource.js";
import type { SwapAction, SwapKind } from "./types.js";

const SWAP_ACTIONS: SwapAction[] = ["request", "accept", "decline", "cancel"];

/** Log lines read as sentences rather than as the verb the route was called with. */
const SWAP_VERB: Record<SwapAction, string> = {
  request: "Asked for",
  accept: "Accepted",
  decline: "Declined",
  cancel: "Withdrew",
};

const SWAP_NOUN: Record<SwapKind, string> = {
  position: "role",
  pickOrder: "pick order",
};
import type { PositionPreference, ServerMessage } from "./types.js";

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

  // --- Runes ---------------------------------------------------------------

  /** Every style, slot and perk — enough to render the rune editor offline. */
  app.get("/api/runes/catalog", (_req, res) => {
    void run(res, async () => readCatalog(session.getClient()));
  });

  /** The player's own saved pages, so the editor can seed from one. */
  app.get("/api/runes/pages", (_req, res) => {
    void run(res, async () => listPages(session.getClient()));
  });

  /**
   * The client's own suggestions. Position is optional — the endpoint needs
   * one, and "NONE" is the neutral answer for modes without roles.
   */
  /**
   * The sources this build knows about, so the phone's picker lists what the
   * agent can actually do rather than a copy that drifts from it.
   */
  app.get("/api/runes/sources", (_req, res) => {
    res.json(
      RUNE_SOURCES.map(({ id, label, help }) => ({ id, label, help })),
    );
  });

  app.get("/api/runes/recommended/:championId", (req, res) => {
    void run(res, async () => {
      const championId = Number(req.params.championId);
      if (!championId) throw new HttpError(400, "championId is required.");
      const position = String(req.query.position ?? "").toUpperCase();
      return recommendedPages(session.getClient(), championId, position);
    });
  });

  app.delete("/api/runes/:championId", (req, res) => {
    void run(res, async () => {
      const championId = Number(req.params.championId);
      if (!championId) throw new HttpError(400, "championId is required.");
      return session.clearRunePage(championId);
    });
  });

  // --- Lobby ---------------------------------------------------------------

  const VALID_SPECTATOR_POLICIES = new Set([
    "AllAllowed",
    "FriendsAllowed",
    "LobbyAllowed",
    "NotAllowed",
  ]);

  const VALID_POSITIONS = new Set([
    "TOP",
    "JUNGLE",
    "MIDDLE",
    "BOTTOM",
    "UTILITY",
    "FILL",
    "UNSELECTED",
  ]);

  app.post("/api/positions", (req, res) => {
    void run(res, async () => {
      const first = String(req.body?.first ?? "UNSELECTED").toUpperCase();
      const second = String(req.body?.second ?? "UNSELECTED").toUpperCase();

      for (const value of [first, second]) {
        if (!VALID_POSITIONS.has(value)) {
          throw new HttpError(400, `"${value}" is not a role the client accepts.`);
        }
      }
      if (first === second && first !== "UNSELECTED" && first !== "FILL") {
        throw new HttpError(400, "Pick two different roles.");
      }

      return session.updatePositions(
        first as PositionPreference,
        second as PositionPreference,
      );
    });
  });

  // --- Game modes ----------------------------------------------------------

  /**
   * The modes the client is currently offering. Read live on every request
   * rather than cached at startup, because a rotating mode can appear or
   * vanish while the agent is running.
   */
  app.get("/api/queues", (_req, res) => {
    void run(res, async () => {
      const queues = await listQueues(session.getClient());
      // Lets the agent name a mode in its activity log later.
      session.rememberQueueNames(queues);
      return queues;
    });
  });

  app.post("/api/queue", (req, res) => {
    void run(res, async () => {
      const queueId = Number(req.body?.queueId);
      if (!queueId) throw new HttpError(400, "queueId is required.");
      return session.setQueue(queueId);
    });
  });

  /** Practice Tool and the custom presets, which need a whole config, not an id. */
  app.post("/api/custom", (req, res) => {
    void run(res, async () => {
      const queueId = Number(req.body?.queueId);
      if (!queueId) throw new HttpError(400, "queueId is required.");

      const spectators = String(req.body?.spectators ?? "AllAllowed");
      if (!VALID_SPECTATOR_POLICIES.has(spectators)) {
        throw new HttpError(400, `"${spectators}" is not a spectator policy the client accepts.`);
      }

      const teamSize = Number(req.body?.teamSize ?? 5);
      if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 5) {
        throw new HttpError(400, "teamSize must be between 1 and 5.");
      }

      return session.createCustom({
        queueId,
        name: String(req.body?.name ?? ""),
        teamSize,
        password: req.body?.password ? String(req.body.password) : undefined,
        spectators: spectators as "AllAllowed" | "FriendsAllowed" | "LobbyAllowed" | "NotAllowed",
      });
    });
  });

  /** Joins a friend's open party by id. */
  app.post("/api/party/join", (req, res) => {
    void run(res, async () => {
      const partyId = String(req.body?.partyId ?? "").trim();
      if (!partyId) throw new HttpError(400, "partyId is required.");
      return session.joinParty(partyId);
    });
  });

  app.post("/api/lobby/invite", (req, res) => {
    void run(res, async () => {
      const raw = Array.isArray(req.body?.puuids) ? req.body.puuids : [req.body?.puuid];
      const puuids = raw.map((value: unknown) => String(value ?? "").trim()).filter(Boolean);
      if (puuids.length === 0) throw new HttpError(400, "At least one puuid is required.");
      const sent = await session.invite(puuids);
      return { ok: true, sent };
    });
  });

  // --- Friends -------------------------------------------------------------

  app.get("/api/friends", (_req, res) => {
    void run(res, async () => session.listFriends());
  });

  app.post("/api/friends", (req, res) => {
    void run(res, async () => {
      // Accepts either a whole Riot ID or the two halves separately, since a
      // phone keyboard makes "Name#TAG" the natural thing to type.
      const riotId = String(req.body?.riotId ?? "").trim();
      let gameName = String(req.body?.gameName ?? "").trim();
      let tagLine = String(req.body?.tagLine ?? "").trim();

      if (riotId.includes("#")) {
        const cut = riotId.lastIndexOf("#");
        gameName = riotId.slice(0, cut).trim();
        tagLine = riotId.slice(cut + 1).trim();
      }
      if (!gameName || !tagLine) {
        throw new HttpError(400, "Give a full Riot ID, like Name#TAG.");
      }

      const who = await session.addFriend(gameName, tagLine);
      return { ok: true, name: who };
    });
  });

  /**
   * The client's own friend groups (the ones its social panel lets you make),
   * so the phone can offer the same organisation rather than inventing one.
   */
  app.get("/api/friend-groups", (_req, res) => {
    void run(res, async () => session.listFriendGroups());
  });

  app.post("/api/friend-groups", (req, res) => {
    void run(res, async () => {
      const name = String(req.body?.name ?? "").trim();
      if (!name) throw new HttpError(400, "Give the group a name.");
      return session.createFriendGroup(name);
    });
  });

  app.put("/api/friend-groups/:id", (req, res) => {
    void run(res, async () => {
      const id = Number(req.params.id);
      const name = String(req.body?.name ?? "").trim();
      if (!id) throw new HttpError(400, "A group id is required.");
      if (!name) throw new HttpError(400, "Give the group a name.");
      return session.renameFriendGroup(id, name);
    });
  });

  app.delete("/api/friend-groups/:id", (req, res) => {
    void run(res, async () => {
      const id = Number(req.params.id);
      if (!id) throw new HttpError(400, "A group id is required.");
      return session.deleteFriendGroup(id);
    });
  });

  /** Moves one friend into a group — 0 is Ungrouped, same as the client. */
  app.post("/api/friends/:puuid/group", (req, res) => {
    void run(res, async () => {
      const puuid = String(req.params.puuid ?? "").trim();
      const groupId = Number(req.body?.groupId ?? NaN);
      if (!puuid) throw new HttpError(400, "A friend puuid is required.");
      if (!Number.isInteger(groupId) || groupId < 0) {
        throw new HttpError(400, "groupId must be 0 (Ungrouped) or a real group id.");
      }
      await session.moveFriendToGroup(puuid, groupId);
      return { ok: true };
    });
  });

  /** The public custom lobbies. Read live — the list turns over constantly. */
  app.get("/api/custom-games", (_req, res) => {
    void run(res, async () => listCustomGames(session.getClient()));
  });

  app.post("/api/custom-games/join", (req, res) => {
    void run(res, async () => {
      const partyId = String(req.body?.partyId ?? "");
      if (!partyId) throw new HttpError(400, "partyId is required.");
      return session.joinCustom(
        partyId,
        req.body?.password ? String(req.body.password) : undefined,
      );
    });
  });

  app.delete("/api/queue", (_req, res) => {
    void run(res, async () => {
      await session.leaveQueue();
      return { ok: true };
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

  /**
   * One route for both kinds and all four verbs, because the client models them
   * that way — the swap's own id identifies the teammate and the kind, so there
   * is nothing else to send.
   */
  app.post("/api/swap", (req, res) => {
    void run(res, async () => {
      const kind = String(req.body?.kind ?? "");
      const action = String(req.body?.action ?? "");
      const id = Number(req.body?.id);

      if (kind !== "position" && kind !== "pickOrder") {
        throw new HttpError(400, "kind must be 'position' or 'pickOrder'.");
      }
      if (!SWAP_ACTIONS.includes(action as SwapAction)) {
        throw new HttpError(400, "action must be request, accept, decline or cancel.");
      }
      if (!Number.isInteger(id) || id < 0) throw new HttpError(400, "id is required.");

      // The swap has to be one the client is currently offering. Without this a
      // stale phone could accept a request that has already expired, and the
      // client's own error for that says nothing worth showing.
      const swap = session.getState().champSelect?.swaps.find(
        (candidate) => candidate.id === id && candidate.kind === kind,
      );
      if (!swap) throw new HttpError(409, "That swap is no longer on offer.");

      await respondToSwap(session.getClient(), kind, id, action as SwapAction);
      session.log(`${SWAP_VERB[action as SwapAction]} a ${SWAP_NOUN[kind]} swap.`);
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
