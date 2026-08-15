import React, { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { championIconUrl, type Connection } from "../api";
import type { Champion } from "../types";
import { radius, spacing, theme } from "../theme";

/**
 * Searchable champion grid. `mode` decides which availability flag greys a
 * champion out — a champion you can ban is not necessarily one you can pick.
 */
export function ChampionGrid({
  champions,
  connection,
  selectedId,
  onSelect,
  mode,
}: {
  champions: Champion[];
  connection: Connection;
  selectedId: number;
  onSelect: (championId: number) => void;
  mode: "pick" | "ban";
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return champions;
    return champions.filter(
      (champion) =>
        champion.name.toLowerCase().includes(needle) ||
        champion.alias.toLowerCase().includes(needle),
    );
  }, [champions, query]);

  const isAvailable = (champion: Champion) => {
    const flag = mode === "ban" ? champion.bannable : champion.pickable;
    // Outside champ select the agent sends no flags; treat everything as open.
    return flag === undefined ? true : flag;
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search champions…"
        placeholderTextColor={theme.textDim}
        style={styles.search}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />

      <FlatList
        data={filtered}
        keyExtractor={(champion) => String(champion.id)}
        numColumns={4}
        columnWrapperStyle={styles.column}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        initialNumToRender={24}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => {
          const available = isAvailable(item);
          const selected = item.id === selectedId;
          return (
            <Pressable
              onPress={() => onSelect(item.id)}
              disabled={!available}
              style={({ pressed }) => [
                styles.tile,
                selected && styles.tileSelected,
                !available && styles.tileUnavailable,
                pressed && styles.tilePressed,
              ]}
            >
              <Image
                source={{ uri: championIconUrl(connection, item.id) }}
                style={styles.icon}
              />
              <Text numberOfLines={1} style={styles.name}>
                {item.name}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No champion matches “{query}”.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  search: {
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    color: theme.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  list: { paddingBottom: spacing.xxl },
  column: { gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flex: 1,
    alignItems: "center",
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  tileSelected: { borderColor: theme.gold, backgroundColor: theme.surfaceRaised },
  tileUnavailable: { opacity: 0.25 },
  tilePressed: { opacity: 0.6 },
  icon: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceRaised,
  },
  name: {
    color: theme.textMuted,
    fontSize: 10,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  empty: {
    color: theme.textDim,
    textAlign: "center",
    marginTop: spacing.xl,
    fontSize: 14,
  },
});
