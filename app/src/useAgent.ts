import { useCallback, useEffect, useRef, useState } from "react";
import { Vibration } from "react-native";
import type { AgentState, ServerMessage } from "./types";
import { socketUrl, type Connection } from "./api";

export type LinkStatus = "connecting" | "online" | "offline";

interface AgentHook {
  state: AgentState | null;
  status: LinkStatus;
  lastAlert: string | null;
  clearAlert: () => void;
  reconnect: () => void;
}

/**
 * Holds the live WebSocket to the agent and mirrors its state.
 *
 * Reconnects with a short backoff, because the common failure here is the
 * phone's radio sleeping rather than the agent dying — we want to be back
 * online before the next ready check, not after a long exponential wait.
 */
export function useAgent(connection: Connection | null): AgentHook {
  const [state, setState] = useState<AgentState | null>(null);
  const [status, setStatus] = useState<LinkStatus>("offline");
  const [lastAlert, setLastAlert] = useState<string | null>(null);

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
        setLastAlert(message.message);
        // Long buzz for a queue pop, short double-tap for a turn in champ select.
        Vibration.vibrate(
          message.kind === "ready-check" ? [0, 400, 200, 400, 200, 400] : [0, 150, 100, 150],
        );
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
    lastAlert,
    clearAlert: () => setLastAlert(null),
    reconnect,
  };
}
