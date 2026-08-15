import React, { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { api, championIconUrl, spellIconUrl, type Connection } from "../api";
import type { AgentState, AutomationSettings, Champion, SummonerSpell } from "../types";
import { Button, Card, Muted, SectionTitle } from "../components/ui";
import { ChampionGrid } from "../components/ChampionGrid";
import { radius, spacing, theme } from "../theme";

/**
 * Presets the agent applies on its own. This is the "I am away from the PC"
 * path: set it before you leave, and champ select resolves without you.
 */
export function AutomationScreen({
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
  const settings = state.automation;
  const [picker, setPicker] = useState<null | "pick" | "ban">(null);

  const update = async (patch: Partial<AutomationSettings>) => {
    try {
      await api.setAutomation(connection, patch);
    } catch (error) {
      onToast((error as Error).message, "error");
    }
  };

  // The catalog only loads once the League client is up, so fall back to the
  // raw id rather than showing "None" for a champion that is in fact set.
  const championName = (id: number) => {
    if (id <= 0) return "None";
    return champions.find((champion) => champion.id === id)?.name ?? `Champion ${id}`;
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>Ready check</SectionTitle>
          <ToggleRow
            label="Auto-accept queue"
            help="Accepts the match the moment it pops."
            value={settings.autoAccept}
            onChange={(value) => void update({ autoAccept: value })}
          />
          {settings.autoAccept && (
            <View style={styles.subSetting}>
              <Text style={styles.subLabel}>
                Wait {(settings.autoAcceptDelayMs / 1000).toFixed(1)}s before accepting
              </Text>
              <View style={styles.chips}>
                {[0, 1500, 4000, 8000].map((ms) => (
                  <Chip
                    key={ms}
                    label={ms === 0 ? "Instant" : `${ms / 1000}s`}
                    active={settings.autoAcceptDelayMs === ms}
                    onPress={() => void update({ autoAcceptDelayMs: ms })}
                  />
                ))}
              </View>
              <Muted>A delay leaves you a window to decline from the phone.</Muted>
            </View>
          )}
        </Card>

        <Card>
          <SectionTitle>Auto pick</SectionTitle>
          <Pressable style={styles.pickerRow} onPress={() => setPicker("pick")}>
            {settings.autoPickChampionId > 0 ? (
              <Image
                source={{ uri: championIconUrl(connection, settings.autoPickChampionId) }}
                style={styles.pickerIcon}
              />
            ) : (
              <View style={[styles.pickerIcon, styles.pickerEmpty]} />
            )}
            <Text style={styles.pickerLabel}>
              {championName(settings.autoPickChampionId)}
            </Text>
            <Text style={styles.pickerChevron}>›</Text>
          </Pressable>

          <ToggleRow
            label="Lock in automatically"
            help="Off means it only hovers, leaving the lock to you."
            value={settings.autoPickLock}
            onChange={(value) => void update({ autoPickLock: value })}
          />
          {settings.autoPickChampionId > 0 && (
            <Button
              label="Clear auto pick"
              variant="ghost"
              onPress={() => void update({ autoPickChampionId: 0 })}
              style={styles.clear}
            />
          )}
        </Card>

        <Card>
          <SectionTitle>Auto ban</SectionTitle>
          <Pressable style={styles.pickerRow} onPress={() => setPicker("ban")}>
            {settings.autoBanChampionId > 0 ? (
              <Image
                source={{ uri: championIconUrl(connection, settings.autoBanChampionId) }}
                style={styles.pickerIcon}
              />
            ) : (
              <View style={[styles.pickerIcon, styles.pickerEmpty]} />
            )}
            <Text style={styles.pickerLabel}>{championName(settings.autoBanChampionId)}</Text>
            <Text style={styles.pickerChevron}>›</Text>
          </Pressable>
          <ToggleRow
            label="Lock ban automatically"
            help="Bans are rarely worth hesitating over."
            value={settings.autoBanLock}
            onChange={(value) => void update({ autoBanLock: value })}
          />
          {settings.autoBanChampionId > 0 && (
            <Button
              label="Clear auto ban"
              variant="ghost"
              onPress={() => void update({ autoBanChampionId: 0 })}
              style={styles.clear}
            />
          )}
        </Card>

        <Card>
          <SectionTitle>Preset summoner spells</SectionTitle>
          <Muted>Applied as soon as champion select opens.</Muted>
          <View style={styles.spellRow}>
            {([1, 2] as const).map((slot) => {
              const current = slot === 1 ? settings.autoSpell1Id : settings.autoSpell2Id;
              return (
                <View key={slot} style={styles.spellSlotColumn}>
                  <Text style={styles.subLabel}>Slot {slot}</Text>
                  <View style={styles.spellChoices}>
                    {spells.map((spell) => (
                      <Pressable
                        key={spell.id}
                        onPress={() =>
                          void update(
                            slot === 1
                              ? { autoSpell1Id: current === spell.id ? 0 : spell.id }
                              : { autoSpell2Id: current === spell.id ? 0 : spell.id },
                          )
                        }
                        style={[
                          styles.spellChoice,
                          current === spell.id && styles.spellChoiceActive,
                        ]}
                      >
                        <Image
                          source={{ uri: spellIconUrl(connection, spell.id) }}
                          style={styles.spellIcon}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        <Card>
          <SectionTitle>Safety net</SectionTitle>
          <Text style={styles.subLabel}>
            {settings.panicLockAtSeconds > 0
              ? `Lock whatever is hovered with ${settings.panicLockAtSeconds}s left`
              : "Never force a lock"}
          </Text>
          <View style={styles.chips}>
            {[0, 3, 5, 8].map((seconds) => (
              <Chip
                key={seconds}
                label={seconds === 0 ? "Off" : `${seconds}s`}
                active={settings.panicLockAtSeconds === seconds}
                onPress={() => void update({ panicLockAtSeconds: seconds })}
              />
            ))}
          </View>
          <Muted>
            Stops you getting a random champion if your phone loses signal mid-select.
          </Muted>
        </Card>
      </ScrollView>

      <Modal visible={picker !== null} animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {picker === "ban" ? "Champion to auto-ban" : "Champion to auto-pick"}
            </Text>
            <Pressable onPress={() => setPicker(null)}>
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>
          <ChampionGrid
            champions={champions}
            connection={connection}
            selectedId={
              picker === "ban" ? settings.autoBanChampionId : settings.autoPickChampionId
            }
            mode={picker === "ban" ? "ban" : "pick"}
            onSelect={(championId) => {
              void update(
                picker === "ban"
                  ? { autoBanChampionId: championId }
                  : { autoPickChampionId: championId },
              );
              setPicker(null);
            }}
          />
        </View>
      </Modal>
    </>
  );
}

function ToggleRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHelp}>{help}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.border, true: theme.blue }}
        thumbColor={theme.goldBright}
      />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    gap: spacing.md,
  },
  toggleText: { flex: 1 },
  toggleLabel: { color: theme.text, fontSize: 15, fontWeight: "600" },
  toggleHelp: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  subSetting: { marginTop: spacing.md },
  subLabel: { color: theme.textMuted, fontSize: 13, marginBottom: spacing.sm },
  chips: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceRaised,
  },
  chipActive: { borderColor: theme.gold, backgroundColor: theme.border },
  chipLabel: { color: theme.textMuted, fontSize: 13, fontWeight: "600" },
  chipLabelActive: { color: theme.gold },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  pickerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceRaised,
  },
  pickerEmpty: { borderWidth: 1, borderColor: theme.border, borderStyle: "dashed" },
  pickerLabel: { color: theme.text, fontSize: 16, flex: 1, fontWeight: "600" },
  pickerChevron: { color: theme.textDim, fontSize: 24 },
  clear: { marginTop: spacing.md },
  spellRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  spellSlotColumn: { flex: 1 },
  spellChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  spellChoice: { borderRadius: radius.sm, borderWidth: 2, borderColor: "transparent" },
  spellChoiceActive: { borderColor: theme.gold },
  spellIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceRaised,
  },
  modal: { flex: 1, backgroundColor: theme.bg, padding: spacing.lg, paddingTop: spacing.xxl },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: { color: theme.goldBright, fontSize: 18, fontWeight: "700", flex: 1 },
  modalClose: { color: theme.blue, fontSize: 16, fontWeight: "600" },
});
