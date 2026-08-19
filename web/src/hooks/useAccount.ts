import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

export type FeatureKey = "automation" | "mode_picker" | "friends";

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

interface AccountHook {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasFeature: (key: FeatureKey) => boolean;
}

/** True while the subscription is active — an expired one grants nothing. */
function isActive(profile: Profile): boolean {
  if (!profile.subscriptionExpiresAt) return false;
  return new Date(profile.subscriptionExpiresAt) > new Date();
}

/**
 * The signed-in app account (separate from pairing with an agent) and its
 * subscription. Supabase persists the session itself (localStorage), so this
 * just mirrors it and keeps the account's feature list in sync.
 */
export function useAccount(): AccountHook {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    let live = true;
    void supabase
      .from("profiles")
      .select("id, email, subscription_tier, subscription_expires_at, features")
      .eq("id", session.user.id)
      .single<ProfileRow>()
      .then(({ data }) => {
        if (!live || !data) return;
        setProfile({
          id: data.id,
          email: data.email,
          subscriptionTier: data.subscription_tier,
          subscriptionExpiresAt: data.subscription_expires_at,
          features: data.features ?? {},
        });
      });
    return () => {
      live = false;
    };
  }, [session]);

  return {
    session,
    profile,
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (email, password) => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    hasFeature: (key) => {
      if (!profile || !isActive(profile)) return false;
      return Boolean(profile.features[key]);
    },
  };
}
