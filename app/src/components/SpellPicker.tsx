import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { spellIconUrl, type Connection } from "../api";
import type { SummonerSpell } from "../types";
import { radius, spacing, theme } from "../theme";

/**
 * Two-slot summoner spell picker. Tapping a spell fills the slot you are
 * editing; picking the spell already in the other slot swaps them rather than
 * producing an illegal duplicate.
 */
export function SpellPicker({
  spells,
  connection,
  spell1Id,
  spell2Id,
  editingSlot,
  onEditSlot,
  onChoose,
}: {
  spells: SummonerSpell[];
  connection: Connection;
  spell1Id: number;
  spell2Id: number;
  editingSlot: 1 | 2;
  onEditSlot: (slot: 1 | 2) => void;
  onChoose: (spellId: number) => void;
}) {
  return (
    <View>
      <View style={styles.slots}>
        {([1, 2] as const).map((slot) => {
          const id = slot === 1 ? spell1Id : spell2Id;
          const active = editingSlot === slot;
          return (
            <Pressable
              key={slot}
              onPress={() => onEditSlot(slot)}
              style={[styles.slot, active && styles.slotActive]}
            >
              {id > 0 ? (
                <Image source={{ uri: spellIconUrl(connection, id) }} style={styles.slotIcon} />
              ) : (
                <View style={[styles.slotIcon, styles.slotEmpty]}>
                  <Text style={styles.slotEmptyText}>D{slot}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
        <Text style={styles.hint}>
          Tap a slot, then pick a spell below.
        </Text>
      </View>

      <View style={styles.grid}>
        {spells.map((spell) => {
          const inUse = spell.id === spell1Id || spell.id === spell2Id;
          return (
            <Pressable
              key={spell.id}
              onPress={() => onChoose(spell.id)}
              style={({ pressed }) => [
                styles.option,
                inUse && styles.optionInUse,
                pressed && styles.optionPressed,
              ]}
            >
              <Image
                source={{ uri: spellIconUrl(connection, spell.id) }}
                style={styles.optionIcon}
              />
              <Text numberOfLines={1} style={styles.optionName}>
                {spell.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slots: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  slot: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: theme.border,
    padding: 2,
  },
  slotActive: { borderColor: theme.gold },
  slotIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceRaised,
  },
  slotEmpty: { alignItems: "center", justifyContent: "center" },
  slotEmptyText: { color: theme.textDim, fontWeight: "700" },
  hint: { color: theme.textDim, fontSize: 11, flex: 1 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  option: { width: 56, alignItems: "center" },
  optionInUse: { opacity: 0.4 },
  optionPressed: { opacity: 0.6 },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceRaised,
  },
  optionName: { color: theme.textMuted, fontSize: 9, marginTop: 2 },
});
