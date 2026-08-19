import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentState, ServerMessage } from "../types";
import { socketUrl, type Connection } from "../lib/api";

export type LinkStatus = "connecting" | "online" | "offline";

export type AlertKind = "ready-check" | "pick-turn" | "ban-turn" | "game-start";

export interface AgentAlert {
  kind: AlertKind;
  message: string;
  /** Distinguishes two identical alerts, so repeats still trigger. */
  at: number;
}

interface AgentHook {
  state: AgentState | null;
  status: LinkStatus;
  alert: AgentAlert | null;
  lastAlert: string | null;
  clearAlert: () => void;
  reconnect: () => void;
}

/**
 * Holds the live WebSocket to the agent and mirrors its state. Reconnects
 * with a short backoff — the common failure is the phone's radio sleeping,
 * not the agent dying, so we want to be back online before the next ready
 * check rather than after a long exponential wait.
 */
export function useAgent(connection: Connection | null): AgentHook {
  const [state, setState] = useState<AgentState | null>(null);
  const [status, setStatus] = useState<LinkStatus>("offline");
  const [alert, setAlert] = useState<AgentAlert | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const wantOpenRef = useRef(true);

  const connect = useCallback(() => {
    if (!connection) return;

    socketRef.current?.close();
    setStatus("connecting");

    const socket = new WebSocket(socketUrl(connection));
    socketRef.current = socket;

    socket.onopen = () => {
      attemptsRef.current = 0;
      setStatus("online");
    };

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }

      if (message.type === "state") {
        setState(message.state);
      } else if (message.type === "alert") {
        setAlert({ kind: message.kind, message: message.message, at: Date.now() });
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          const urgent = message.kind === "ready-check" || message.kind === "game-start";
          navigator.vibrate(urgent ? [400, 200, 400, 200, 400] : [150, 100, 150]);
        }
      }
    };

    socket.onerror = () => setStatus("offline");

    socket.onclose = () => {
      setStatus("offline");
      if (!wantOpenRef.current) return;
      attemptsRef.current += 1;
      const backoff = Math.min(1000 * attemptsRef.current, 5000);
      retryRef.current = setTimeout(connect, backoff);
    };
  }, [connection]);

  useEffect(() => {
    wantOpenRef.current = true;
    if (!connection) {
      setState(null);
      setStatus("offline");
      return;
    }
    connect();

    return () => {
      wantOpenRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connection, connect]);

  const reconnect = useCallback(() => {
    attemptsRef.current = 0;
    connect();
  }, [connect]);

  return {
    state,
    status,
    alert,
    lastAlert: alert?.message ?? null,
    clearAlert: () => setAlert(null),
    reconnect,
  };
}
