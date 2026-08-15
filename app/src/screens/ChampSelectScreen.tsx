import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, championIconUrl, type Connection } from "../api";
import type { AgentState, Champion, Skin, SummonerSpell } from "../types";
import { Button, Card, Muted, SectionTitle } from "../components/ui";
import { ChampionGrid } from "../components/ChampionGrid";
import { SkinPicker } from "../components/SkinPicker";
import { SpellPicker } from "../components/SpellPicker";
import { radius, spacing, theme } from "../theme";

type Tab = "champion" | "spells" | "skin";

export function ChampSelectScreen({
  state,
  connection,
  champions,
  spells,
  onToast,
}: {
  state: AgentState;
  connection: Connection;
  champions: Champion[];
  spells: SummonerSpell[];
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const select = state.champSelect;
  const [tab, setTab] = useState<Tab>("champion");
  const [hovered, setHovered] = useState(0);
  const [busy, setBusy] = useState(false);

  const [skins, setSkins] = useState<Skin[]>([]);
  const [skinsLoading, setSkinsLoading] = useState(false);
  const [editingSlot, setEditingSlot] = useState<1 | 2>(1);

  const lockedChampionId = select?.selection?.championId ?? 0;

  // Reload the skin carousel whenever the locked champion changes.
  useEffect(() => {
    if (!lockedChampionId) {
      setSkins([]);
      return;
    }
    let cancelled = false;
    setSkinsLoading(true);
    api
      .skins(connection, lockedChampionId)
      .then((result) => {
        if (!cancelled) setSkins(result);
      })
      .catch(() => {
        if (!cancelled) setSkins([]);
      })
      .finally(() => {
        if (!cancelled) setSkinsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, lockedChampionId]);

  const guard = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      setBusy(true);
      try {
        await action();
        onToast(success, "ok");
      } catch (error) {
        onToast((error as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    [onToast],
  );

  if (!select) {
    return (
      <View style={styles.centered}>
        <Text style={styles.idleTitle}>Not in champion select</Text>
        <Muted>This screen wakes up when a match starts.</Muted>
      </View>
    );
  }

  const action = select.myAction;
  const isMyTurn = Boolean(action?.isInProgress && !action.completed);
  const isBan = action?.type === "ban";
  const seconds = Math.max(0, Math.ceil(select.timeLeftMs / 1000));
  const target = hovered || action?.championId || 0;

  return (
    <View style={styles.container}>
      {/* Turn banner — pinned, since the timer is the thing you watch. */}
      <View
        style={[styles.banner, isMyTurn && (isBan ? styles.bannerBan : styles.bannerPick)]}
      >
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>
            {isMyTurn
              ? isBan
                ? "Your turn to ban"
                : "Your turn to pick"
              : phaseLabel(select.phase)}
          </Text>
          <Text style={styles.bannerSub}>
            {isMyTurn ? "Choose below, then lock in." : "Waiting on other players…"}
          </Text>
        </View>
        <Text style={[styles.timer, seconds <= 5 && styles.timerUrgent]}>{seconds}s</Text>
      </View>

      <View style={styles.tabs}>
        {(["champion", "spells", "skin"] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, tab === value && styles.tabLabelActive]}>
              {value === "champion" ? "Champion" : value === "spells" ? "Spells" : "Skin"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/*
        The champion tab hosts the grid's own FlatList, so it is deliberately
        not wrapped in a ScrollView — nesting the two breaks virtualization.
      */}
      {tab === "champion" ? (
        <View style={styles.tabBody}>
          {isMyTurn ? (
            <>
              <View style={styles.actionRow}>
                <Button
                  label={isBan ? "Hover ban" : "Hover"}
                  variant="ghost"
                  disabled={!target || busy}
                  onPress={() =>
                    void guard(
                      () => api.select(connection, target, false),
                      isBan ? "Ban hovered." : "Champion hovered.",
                    )
                  }
                  style={styles.actionButton}
                />
                <Button
                  label={isBan ? "Lock ban" : "Lock in"}
                  variant={isBan ? "danger" : "gold"}
                  disabled={!target || busy}
                  onPress={() =>
                    void guard(
                      () => api.select(connection, target, true),
                      isBan ? "Ban locked." : "Champion locked in.",
                    )
                  }
                  style={styles.actionButton}
                />
              </View>
              <ChampionGrid
                champions={champions}
                connection={connection}
                selectedId={target}
                onSelect={setHovered}
                mode={isBan ? "ban" : "pick"}
              />
            </>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollBody}>
              <Card>
                <Muted>
                  {lockedChampionId
                    ? "You are locked in. Set your spells and skin while you wait."
                    : "It is not your turn yet. The buttons unlock the moment it is."}
                </Muted>
              </Card>
              <BenchCard
                select={select}
                connection={connection}
                busy={busy}
                onSwap={(championId) =>
                  void guard(
                    () => api.benchSwap(connection, championId),
                    "Swapped from the bench.",
                  )
                }
              />
              <TeamCard select={select} connection={connection} />
            </ScrollView>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
          {tab === "spells" && (
            <Card>
              <SectionTitle>Summoner spells</SectionTitle>
              <SpellPicker
                spells={spells}
                connection={connection}
                spell1Id={select.selection?.spell1Id ?? 0}
                spell2Id={select.selection?.spell2Id ?? 0}
                editingSlot={editingSlot}
                onEditSlot={setEditingSlot}
                onChoose={(spellId) => {
                  const current1 = select.selection?.spell1Id ?? 0;
                  const current2 = select.selection?.spell2Id ?? 0;
                  // Choosing the spell already in the other slot swaps them.
                  const next1 =
                    editingSlot === 1 ? spellId : current1 === spellId ? current2 : current1;
                  const next2 =
                    editingSlot === 2 ? spellId : current2 === spellId ? current1 : current2;
                  void guard(
                    () => api.setSpells(connection, next1, next2),
                    "Summoner spells updated.",
                  );
                }}
              />
            </Card>
          )}

          {tab === "skin" && (
            <Card>
              <SectionTitle>Skin</SectionTitle>
              {lockedChampionId ? (
                <SkinPicker
                  skins={skins}
                  loading={skinsLoading}
                  connection={connection}
                  championId={lockedChampionId}
                  selectedSkinId={select.selection?.selectedSkinId ?? 0}
                  onSelect={(skinId) =>
                    void guard(() => api.setSkin(connection, skinId), "Skin selected.")
                  }
                />
              ) : (
                <Muted>Lock in a champion first — then your skins appear here.</Muted>
              )}
            </Card>
          )}

          <TeamCard select={select} connection={connection} />
        </ScrollView>
      )}
    </View>
  );
}

function BenchCard({
  select,
  connection,
  busy,
  onSwap,
}: {
  select: NonNullable<AgentState["champSelect"]>;
  connection: Connection;
  busy: boolean;
  onSwap: (championId: number) => void;
}) {
  if (!select.benchEnabled || select.benchChampionIds.length === 0) return null;

  return (
    <Card>
      <SectionTitle>Bench — tap to swap</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.benchRow}>
          {select.benchChampionIds.map((championId) => (
            <Pressable key={championId} disabled={busy} onPress={() => onSwap(championId)}>
              <Image
                source={{ uri: championIconUrl(connection, championId) }}
                style={styles.benchIcon}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

function TeamCard({
  select,
  connection,
}: {
  select: NonNullable<AgentState["champSelect"]>;
  connection: Connection;
}) {
  const bans = [...select.bans.myTeamBans, ...select.bans.theirTeamBans].filter(Boolean);

  return (
    <Card>
      <SectionTitle>Your team</SectionTitle>
      <View style={styles.teamRow}>
        {select.myTeam.map((slot) => {
          const shown = slot.championId || slot.championPickIntent;
          return (
            <View key={slot.cellId} style={styles.teamSlot}>
              {shown > 0 ? (
                <Image
                  source={{ uri: championIconUrl(connection, shown) }}
                  style={[styles.teamIcon, slot.isLocalPlayer && styles.teamIconMe]}
                />
              ) : (
                <View
                  style={[
                    styles.teamIcon,
                    styles.teamIconEmpty,
                    slot.isLocalPlayer && styles.teamIconMe,
                  ]}
                />
              )}
              <Text numberOfLines={1} style={styles.teamPosition}>
                {slot.assignedPosition || "—"}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.divider} />

      <SectionTitle>Bans</SectionTitle>
      {bans.length === 0 ? (
        <Text style={styles.bansText}>None yet.</Text>
      ) : (
        <View style={styles.banRow}>
          {bans.map((championId, index) => (
            <Image
              key={`${championId}-${index}`}
              source={{ uri: championIconUrl(connection, championId) }}
              style={styles.banIcon}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

function phaseLabel(phase: string): string {
  if (phase === "PLANNING") return "Declaring intent";
  if (phase === "BAN_PICK") return "Ban / pick phase";
  if (phase === "FINALIZATION") return "Finalizing";
  return "Champion select";
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  scrollBody: { paddingBottom: spacing.xxl },
  tabBody: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  idleTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  bannerPick: { borderColor: theme.gold, backgroundColor: "#1a2a1f" },
  bannerBan: { borderColor: theme.red, backgroundColor: "#2a1420" },
  bannerText: { flex: 1 },
  bannerTitle: { color: theme.goldBright, fontSize: 17, fontWeight: "800" },
  bannerSub: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  timer: { color: theme.text, fontSize: 26, fontWeight: "800", fontVariant: ["tabular-nums"] },
  timerUrgent: { color: theme.red },
  tabs: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: "center" },
  tabActive: { backgroundColor: theme.surfaceRaised },
  tabLabel: { color: theme.textMuted, fontSize: 13, fontWeight: "600" },
  tabLabelActive: { color: theme.gold },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  actionButton: { flex: 1 },
  benchRow: { flexDirection: "row", gap: spacing.sm },
  benchIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceRaised,
  },
  teamRow: { flexDirection: "row", gap: spacing.sm },
  teamSlot: { flex: 1, alignItems: "center" },
  teamIcon: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 2,
    borderColor: "transparent",
  },
  teamIconEmpty: { borderColor: theme.border, borderStyle: "dashed" },
  teamIconMe: { borderColor: theme.gold },
  teamPosition: { color: theme.textDim, fontSize: 9, marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: spacing.lg },
  bansText: { color: theme.textMuted, fontSize: 13 },
  banRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  banIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceRaised,
    opacity: 0.7,
  },
});
