import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";
import { type FeatureKey, isFeatureKey } from "./features.js";

export interface Profile {
  id: string;
  email: string;
  subscriptionTier: "free" | "monthly" | "yearly";
  subscriptionExpiresAt: string | null;
  features: Partial<Record<FeatureKey, boolean>>;
}

interface ProfileRow {
  id: string;
  email: string;
  subscription_tier: Profile["subscriptionTier"];
  subscription_expires_at: string | null;
  features: Record<string, boolean> | null;
}

// Short-lived — long enough that switching screens doesn't re-fetch on every
// click, short enough that a feature flipped in the admin dashboard takes
// effect within a minute without needing the phone to reconnect.
const CACHE_MS = 60_000;
const cache = new Map<string, { profile: Profile; expiresAt: number }>();

/**
 * Verifies a Supabase access token and returns the account it belongs to —
 * or null if the token is missing, expired, or doesn't resolve to a profile.
 *
 * Reads the profile using the *caller's own* access token rather than an
 * admin key, so Postgres row-level security (not this function) is what
 * actually prevents one account from reading another's subscription.
 */
export async function verifyAccountToken(token: string | undefined): Promise<Profile | null> {
  if (!token) return null;

  const cached = cache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data, error } = await client
    .from("profiles")
    .select("id, email, subscription_tier, subscription_expires_at, features")
    .eq("id", userData.user.id)
    .single<ProfileRow>();
  if (error || !data) return null;

  const profile: Profile = {
    id: data.id,
    email: data.email,
    subscriptionTier: data.subscription_tier,
    subscriptionExpiresAt: data.subscription_expires_at,
    features: Object.fromEntries(
      Object.entries(data.features ?? {}).filter(([key]) => isFeatureKey(key)),
    ),
  };
  cache.set(token, { profile, expiresAt: Date.now() + CACHE_MS });
  return profile;
}

/** True when the account's subscription is active and grants this feature. */
export function hasFeature(profile: Profile | null, key: FeatureKey): boolean {
  if (!profile) return false;
  if (profile.subscriptionExpiresAt && new Date(profile.subscriptionExpiresAt) <= new Date()) {
    return false;
  }
  return Boolean(profile.features[key]);
}
