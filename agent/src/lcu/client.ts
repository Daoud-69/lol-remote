import https from "node:https";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { LcuCredentials } from "./credentials.js";

/**
 * The client serves a self-signed certificate. Riot publishes the signing root,
 * but pinning it buys nothing here: we are talking to a loopback socket whose
 * port and password we read off the local process.
 */
const TLS = { rejectUnauthorized: false } as const;

export interface LcuEvent {
  uri: string;
  eventType: "Create" | "Update" | "Delete";
  data: unknown;
}

export class LcuClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private closed = false;

  constructor(private readonly credentials: LcuCredentials) {
    super();
  }

  private get authHeader(): string {
    const token = Buffer.from(`riot:${this.credentials.password}`).toString("base64");
    return `Basic ${token}`;
  }

  /** Raw request against the LCU. Returns parsed JSON, or a Buffer for binary. */
  request<T = unknown>(
    method: string,
    endpoint: string,
    body?: unknown,
    binary = false,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));

      const req = https.request(
        {
          ...TLS,
          host: "127.0.0.1",
          port: this.credentials.port,
          path: endpoint,
          method,
          headers: {
            Authorization: this.authHeader,
            Accept: "application/json",
            ...(payload
              ? { "Content-Type": "application/json", "Content-Length": payload.length }
              : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            const status = res.statusCode ?? 0;

            if (status >= 400) {
              reject(
                new LcuError(
                  `LCU ${method} ${endpoint} failed with ${status}`,
                  status,
                  buffer.toString("utf8"),
                ),
              );
              return;
            }
            if (binary) {
              resolve({ buffer, contentType: res.headers["content-type"] } as T);
              return;
            }
            if (buffer.length === 0) {
              resolve(undefined as T);
              return;
            }
            try {
              resolve(JSON.parse(buffer.toString("utf8")) as T);
            } catch {
              resolve(buffer.toString("utf8") as T);
            }
          });
        },
      );

      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  get<T>(endpoint: string) {
    return this.request<T>("GET", endpoint);
  }
  post<T>(endpoint: string, body?: unknown) {
    return this.request<T>("POST", endpoint, body);
  }
  patch<T>(endpoint: string, body?: unknown) {
    return this.request<T>("PATCH", endpoint, body);
  }
  put<T>(endpoint: string, body?: unknown) {
    return this.request<T>("PUT", endpoint, body);
  }
  delete<T>(endpoint: string) {
    return this.request<T>("DELETE", endpoint);
  }

  /** Fetches an asset (champion icon, skin splash) straight from the client. */
  getBinary(endpoint: string) {
    return this.request<{ buffer: Buffer; contentType?: string }>(
      "GET",
      endpoint,
      undefined,
      true,
    );
  }

  /**
   * Subscribes to the client's event bus. Emits `event` for every change we
   * care about, and `close` when the client goes away so the supervisor can
   * tear this instance down and wait for a fresh one.
   */
  connectEvents(topics: string[]): void {
    const socket = new WebSocket(
      `wss://127.0.0.1:${this.credentials.port}`,
      "wamp",
      { ...TLS, headers: { Authorization: this.authHeader } },
    );
    this.socket = socket;

    socket.on("open", () => {
      // WAMP opcode 5 = SUBSCRIBE.
      for (const topic of topics) socket.send(JSON.stringify([5, topic]));
      this.emit("open");
    });

    socket.on("message", (raw: WebSocket.RawData) => {
      const text = raw.toString();
      if (!text) return;
      try {
        // Opcode 8 = EVENT: [8, topic, { uri, eventType, data }]
        const frame = JSON.parse(text);
        if (Array.isArray(frame) && frame[0] === 8 && frame[2]) {
          this.emit("event", frame[2] as LcuEvent);
        }
      } catch {
        // The client occasionally emits non-JSON keepalives.
      }
    });

    socket.on("close", () => {
      if (!this.closed) this.emit("close");
    });
    socket.on("error", (err) => this.emit("socket-error", err));
  }

  destroy(): void {
    this.closed = true;
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
    this.removeAllListeners();
  }
}

export class LcuError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "LcuError";
  }
}
