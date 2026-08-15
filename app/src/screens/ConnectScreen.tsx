import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ping, verify, type Connection } from "../api";
import { Button, Card, Muted, SectionTitle } from "../components/ui";
import { radius, spacing, theme } from "../theme";

export function ConnectScreen({
  initial,
  onConnected,
}: {
  initial: Connection | null;
  onConnected: (connection: Connection) => void;
}) {
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(String(initial?.port ?? 8777));
  const [code, setCode] = useState(initial?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const portNumber = Number(port);

    if (!host.trim()) return setError("Enter the IP address shown by the agent.");
    if (!Number.isInteger(portNumber) || portNumber <= 0) return setError("Port must be a number.");
    if (code.trim().length !== 6) return setError("The pairing code is six digits.");

    setBusy(true);
    try {
      const reachable = await ping(host.trim(), portNumber);
      if (!reachable) {
        setError(
          "No agent answered. Check the PC agent is running and both devices are on the same Wi-Fi.",
        );
        return;
      }

      const connection: Connection = { host: host.trim(), port: portNumber, code: code.trim() };
      if (!(await verify(connection))) {
        setError("The agent rejected that pairing code.");
        return;
      }
      onConnected(connection);
    } catch {
      setError("Could not reach the agent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>LoL Remote</Text>
        <Text style={styles.subtitle}>Control champion select from your phone.</Text>

        <Card>
          <SectionTitle>Connect to your PC</SectionTitle>

          <Text style={styles.label}>Agent IP address</Text>
          <TextInput
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.20"
            placeholderTextColor={theme.textDim}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <Text style={styles.label}>Port</Text>
          <TextInput
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Pairing code</Text>
          <TextInput
            value={code}
            onChangeText={(next) => setCode(next.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={theme.textDim}
            keyboardType="number-pad"
            style={[styles.input, styles.codeInput]}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            label={busy ? "Connecting…" : "Connect"}
            onPress={() => void submit()}
            loading={busy}
            style={styles.submit}
          />
        </Card>

        <Card>
          <SectionTitle>Where do I find these?</SectionTitle>
          <Muted>
            Run the agent on your gaming PC. It prints the IP address, port and pairing code in
            its window. Your phone must be on the same Wi-Fi network.
          </Muted>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: {
    color: theme.goldBright,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  label: {
    color: theme.textMuted,
    fontSize: 12,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    color: theme.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  codeInput: { letterSpacing: 8, fontSize: 22, textAlign: "center" },
  error: { color: theme.red, fontSize: 13, marginTop: spacing.md, lineHeight: 18 },
  submit: { marginTop: spacing.lg },
});
