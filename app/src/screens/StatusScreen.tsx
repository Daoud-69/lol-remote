import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type Connection } from "../api";
import type { AgentState } from "../types";
import type { LinkStatus } from "../useAgent";
import { Button, Card, Muted, SectionTitle, StatusDot } from "../components/ui";
import { spacing, theme } from "../theme";

export function StatusScreen({
  state,
  status,
  connection,
  onDisconnect,
  onToast,
}: {
  state: AgentState | null;
  status: LinkStatus;
  connection: Connection;
  onDisconnect: () => void;
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      onToast(success, "ok");
    } catch (error) {
      onToast((error as Error).message, "error");
    }
  };

  const linkColor =
    status === "online" ? theme.green : status === "connecting" ? theme.gold : theme.red;
  const clientColor = state?.connectedToClient ? theme.green : theme.red;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <SectionTitle>Connection</SectionTitle>

        <View style={styles.statusLine}>
          <StatusDot color={linkColor} />
          <Text style={styles.statusLabel}>Phone → PC agent</Text>
          <Text style={[styles.statusValue, { color: linkColor }]}>
            {status === "online" ? "Connected" : status === "connecting" ? "Connecting…" : "Offline"}
          </Text>
        </View>

        <View style={styles.statusLine}>
          <StatusDot color={clientColor} />
          <Text style={styles.statusLabel}>Agent → League client</Text>
          <Text style={[styles.statusValue, { color: clientColor }]}>
            {state?.connectedToClient ? "Connected" : "Not running"}
          </Text>
        </View>

        <Text style={styles.host}>
          {connection.host}:{connection.port}
        </Text>

        {state?.summoner && <Text style={styles.summoner}>{state.summoner.displayName}</Text>}
      </Card>

      <Card>
        <SectionTitle>Right now</SectionTitle>
        <Text style={styles.phase}>{describePhase(state)}</Text>

        {state?.phase === "Lobby" && (
          <Button
            label="Start queue"
            onPress={() => void run(() => api.startQueue(connection), "Queue started.")}
            style={styles.action}
          />
        )}

        {state?.phase === "Matchmaking" && (
          <Button
            label="Stop queue"
            variant="ghost"
            onPress={() => void run(() => api.stopQueue(connection), "Queue stopped.")}
            style={styles.action}
          />
        )}
      </Card>

      <Card>
        <SectionTitle>Agent activity</SectionTitle>
        {state && state.log.length > 0 ? (
          state.log.slice(0, 12).map((entry) => (
            <View key={`${entry.at}-${entry.message}`} style={styles.logLine}>
              <Text style={styles.logTime}>
                {new Date(entry.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              <Text style={styles.logMessage}>{entry.message}</Text>
            </View>
          ))
        ) : (
          <Muted>Nothing yet.</Muted>
        )}
      </Card>

      <Button label="Disconnect" variant="ghost" onPress={onDisconnect} />
    </ScrollView>
  );
}

function describePhase(state: AgentState | null): string {
  if (!state?.connectedToClient) return "The League client is not running on your PC.";
  switch (state.phase) {
    case "None":
      return "Sitting in the client.";
    case "Lobby":
      return "In a lobby, not queued.";
    case "Matchmaking":
      return "Searching for a match…";
    case "ReadyCheck":
      return "Match found — waiting for you to accept.";
    case "ChampSelect":
      return "In champion select.";
    case "GameStart":
    case "InProgress":
      return "Game in progress.";
    case "WaitingForStats":
    case "PreEndOfGame":
    case "EndOfGame":
      return "Game just finished.";
    default:
      return state.phase;
  }
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statusLabel: { color: theme.textMuted, fontSize: 14, flex: 1 },
  statusValue: { fontSize: 14, fontWeight: "700" },
  host: {
    color: theme.textDim,
    fontSize: 12,
    marginTop: spacing.md,
    fontVariant: ["tabular-nums"],
  },
  summoner: { color: theme.gold, fontSize: 15, fontWeight: "700", marginTop: spacing.xs },
  phase: { color: theme.text, fontSize: 16, lineHeight: 22 },
  action: { marginTop: spacing.lg },
  logLine: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  logTime: {
    color: theme.textDim,
    fontSize: 11,
    width: 52,
    fontVariant: ["tabular-nums"],
  },
  logMessage: { color: theme.textMuted, fontSize: 12, flex: 1, lineHeight: 17 },
});
