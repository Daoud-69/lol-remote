import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { skinSplashUrl, type Connection } from "../api";
import type { Skin } from "../types";
import { radius, spacing, theme } from "../theme";

/**
 * Skin carousel. Locked skins stay visible but unselectable — seeing what you
 * do not own is part of browsing, and the client would reject the pick anyway.
 */
export function SkinPicker({
  skins,
  loading,
  connection,
  championId,
  selectedSkinId,
  onSelect,
}: {
  skins: Skin[];
  loading: boolean;
  connection: Connection;
  championId: number;
  selectedSkinId: number;
  onSelect: (skinId: number) => void;
}) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.gold} />
      </View>
    );
  }

  if (skins.length === 0) {
    return <Text style={styles.empty}>No skins to show yet.</Text>;
  }

  const owned = skins.filter((skin) => skin.unlocked || skin.isBase);
  const locked = skins.filter((skin) => !skin.unlocked && !skin.isBase);
  const ordered = [...owned, ...locked];

  return (
    <FlatList
      horizontal
      data={ordered}
      keyExtractor={(skin) => String(skin.id)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const selectable = item.unlocked || item.isBase;
        const selected = item.id === selectedSkinId;
        return (
          <Pressable
            onPress={() => onSelect(item.id)}
            disabled={!selectable}
            style={({ pressed }) => [
              styles.tile,
              selected && styles.tileSelected,
              pressed && selectable && styles.tilePressed,
            ]}
          >
            <Image
              source={{ uri: skinSplashUrl(connection, championId, item.id) }}
              style={[styles.splash, !selectable && styles.splashLocked]}
              resizeMode="cover"
            />
            {!selectable && (
              <View style={styles.lockBadge}>
                <Text style={styles.lockText}>LOCKED</Text>
              </View>
            )}
            <Text numberOfLines={2} style={[styles.name, selected && styles.nameSelected]}>
              {item.isBase ? "Default" : item.name}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: { paddingVertical: spacing.xl, alignItems: "center" },
  empty: { color: theme.textDim, fontSize: 13, paddingVertical: spacing.md },
  list: { gap: spacing.md, paddingVertical: spacing.xs },
  tile: { width: 132 },
  tileSelected: {},
  tilePressed: { opacity: 0.7 },
  splash: {
    width: 132,
    height: 78,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: theme.border,
    backgroundColor: theme.surfaceRaised,
  },
  splashLocked: { opacity: 0.35 },
  lockBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(10,20,40,0.85)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  lockText: { color: theme.textMuted, fontSize: 9, fontWeight: "700" },
  name: { color: theme.textMuted, fontSize: 11, marginTop: spacing.xs },
  nameSelected: { color: theme.gold, fontWeight: "700" },
});
