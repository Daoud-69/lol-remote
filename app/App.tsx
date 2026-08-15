import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useKeepAwake } from "expo-keep-awake";
import { api, type Connection } from "./src/api";
import type { Champion, SummonerSpell } from "./src/types";
import { useAgent } from "./src/useAgent";
import { usePushRegistration } from "./src/usePushRegistration";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { StatusScreen } from "./src/screens/StatusScreen";
import { ChampSelectScreen } from "./src/screens/ChampSelectScreen";
import { AutomationScreen } from "./src/screens/AutomationScreen";
import { Button } from "./src/components/ui";
import { radius, spacing, theme } from "./src/theme";

const STORAGE_KEY = "lol-remote:connection";

type Tab = "status" | "select" | "auto";
type Toast = { message: string; kind: "ok" | "error" } | null;

export default function App() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState<Tab>("status");
  const [toast, setToast] = useState<Toast>(null);

  const [champions, setChampions] = useState<Champion[]>([]);
  const [spells, setSpells] = useState<SummonerSpell[]>([]);

  const { state, status, lastAlert, clearAlert } = useAgent(connection);
  usePushRegistration(connection);

  // Champ select is a two-minute window where a sleeping screen loses the game.
  useKeepAwake();

  // Restore the saved connection on launch.
  useEffect(() => {
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setConnection(JSON.parse(saved) as Connection);
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const showToast = useCallback((message: string, kind: "ok" | "error") => {
    setToast({ message, kind });
  }, []);

  // Auto-dismiss toasts, resetting the timer when a new one arrives.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  // Catalogs are static per patch; fetch once the client is up.
  useEffect(() => {
    if (!connection || !state?.connectedToClient) return;
    if (champions.length > 0 && spells.length > 0) return;

    void (async () => {
      try {
        const [nextChampions, nextSpells] = await Promise.all([
          api.champions(connection),
          api.spells(connection),
        ]);
        setChampions(nextChampions);
        setSpells(nextSpells);
      } catch {
        // The status screen already surfaces the disconnected state.
      }
    })();
  }, [connection, state?.connectedToClient, champions.length, spells.length]);

  // Refresh pickable/bannable flags on entering champ select, and jump to it.
  useEffect(() => {
    if (state?.phase !== "ChampSelect" || !connection) return;
    setTab("select");
    void api.champions(connection).then(setChampions).catch(() => undefined);
  }, [state?.phase, connection]);

  const connect = async (next: Connection) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setConnection(next);
  };

  const disconnect = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setConnection(null);
    setChampions([]);
    setSpells([]);
  };

  if (restoring) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.gold} size="large" />
      </View>
    );
  }

  if (!connection) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <ConnectScreen initial={null} onConnected={(next) => void connect(next)} />
      </SafeAreaView>
    );
  }

  const readyCheckPending =
    state?.readyCheck?.state === "InProgress" && state.readyCheck.playerResponse === "None";

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.body}>
        {tab === "status" && (
          <StatusScreen
            state={state}
            status={status}
            connection={connection}
            onDisconnect={() => void disconnect()}
            onToast={showToast}
          />
        )}
        {tab === "select" && state && (
          <ChampSelectScreen
            state={state}
            connection={connection}
            champions={champions}
            spells={spells}
            onToast={showToast}
          />
        )}
        {tab === "auto" && state && (
          <AutomationScreen
            state={state}
            connection={connection}
            champions={champions}
            spells={spells}
            onToast={showToast}
          />
        )}
      </View>

      {/* Ready check takes over the screen — it is the whole point of the app. */}
      {readyCheckPending && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>MATCH FOUND</Text>
          <Text style={styles.overlaySub}>
            {Math.max(0, 12 - Math.floor(state.readyCheck?.timer ?? 0))}s to respond
          </Text>
          <Button
            label="ACCEPT"
            size="lg"
            variant="gold"
            style={styles.overlayAccept}
            onPress={() =>
              void api
                .accept(connection)
                .then(() => showToast("Accepted.", "ok"))
                .catch((error: Error) => showToast(error.message, "error"))
            }
          />
          <Button
            label="Decline"
            variant="ghost"
            onPress={() =>
              void api
                .decline(connection)
                .then(() => showToast("Declined.", "ok"))
                .catch((error: Error) => showToast(error.message, "error"))
            }
          />
        </View>
      )}

      {lastAlert && !readyCheckPending && (
        <Pressable style={styles.alert} onPress={clearAlert}>
          <Text style={styles.alertText}>{lastAlert}</Text>
        </Pressable>
      )}

      {toast && (
        <View style={[styles.toast, toast.kind === "error" && styles.toastError]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      <View style={styles.tabBar}>
        {(
          [
            ["status", "Status"],
            ["select", "Champ Select"],
            ["auto", "Automation"],
          ] as const
        ).map(([value, label]) => (
          <Pressable key={value} style={styles.tabItem} onPress={() => setTab(value)}>
            <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{label}</Text>
            {tab === value && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  loading: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  tabText: { color: theme.textMuted, fontSize: 12, fontWeight: "600" },
  tabTextActive: { color: theme.gold },
  tabIndicator: {
    height: 2,
    width: 24,
    backgroundColor: theme.gold,
    borderRadius: 1,
    marginTop: spacing.xs,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(10,20,40,0.97)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  overlayTitle: {
    color: theme.goldBright,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 2,
  },
  overlaySub: { color: theme.textMuted, fontSize: 15, marginBottom: spacing.xl },
  overlayAccept: { alignSelf: "stretch" },
  alert: {
    position: "absolute",
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: theme.gold,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alertText: { color: theme.bg, fontWeight: "700", textAlign: "center" },
  toast: {
    position: "absolute",
    bottom: 70,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.green,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  toastError: { borderColor: theme.red },
  toastText: { color: theme.text, fontSize: 13, textAlign: "center" },
});
