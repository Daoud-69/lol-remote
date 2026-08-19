/**
 * The premium feature set, gated behind a subscription. Keys here are exactly
 * the keys stored in each account's `profiles.features` JSON column in
 * Supabase — the admin dashboard's checkbox list reads and writes this same
 * list, so adding a feature here is the only step needed to make it
 * toggleable there too.
 */
export const FEATURE_KEYS = ["automation", "mode_picker", "friends"] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  automation: "Ready check, roles, bans, runes, and spell automation",
  mode_picker: "Game mode switching",
  friends: "Friend invites and party management",
};

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}
