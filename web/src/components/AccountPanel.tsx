import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Mail, X } from "lucide-react";
import { Card, Muted, SectionTitle } from "./ui/primitives";
import { Button } from "./ui/Button";
import type { FeatureKey, Profile } from "../hooks/useAccount";

const FEATURE_LABELS: Record<FeatureKey, string> = {
  automation: "Ready check, roles, bans, runes, and spell automation",
  mode_picker: "Game mode switching",
  friends: "Friend invites and party management",
};

const TIER_LABELS: Record<Profile["subscriptionTier"], string> = {
  free: "Free",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function AccountPanel({
  visible,
  onClose,
  profile,
  signedIn,
  onSignIn,
  onSignUp,
  onSignOut,
}: {
  visible: boolean;
  onClose: () => void;
  profile: Profile | null;
  signedIn: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/90 backdrop-blur-md px-5"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="w-full max-w-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <Card className="relative">
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 text-ink-dim hover:text-ink transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {signedIn ? (
                <SignedIn profile={profile} onSignOut={onSignOut} />
              ) : (
                <SignInForm onSignIn={onSignIn} onSignUp={onSignUp} />
              )}
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SignedIn({ profile, onSignOut }: { profile: Profile | null; onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  if (!profile) {
    return (
      <>
        <SectionTitle accent="hextech">Account</SectionTitle>
        <Muted>Loading your account…</Muted>
      </>
    );
  }

  const expiresLabel = profile.subscriptionExpiresAt
    ? new Date(profile.subscriptionExpiresAt).toLocaleDateString()
    : null;
  const active = expiresLabel && new Date(profile.subscriptionExpiresAt!) > new Date();

  return (
    <>
      <SectionTitle accent="hextech">Account</SectionTitle>
      <p className="text-ink text-sm font-semibold truncate">{profile.email}</p>

      <div className="mt-4 pt-4 border-t border-hairline space-y-3">
        <Row label="Plan" value={TIER_LABELS[profile.subscriptionTier]} />
        <Row
          label="Status"
          value={active ? `Active until ${expiresLabel}` : "Not subscribed"}
          tone={active ? "success" : "dim"}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-hairline">
        <p className="text-ink-dim text-xs uppercase tracking-wider mb-2.5">Unlocked features</p>
        <ul className="space-y-1.5">
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => (
            <li key={key} className="flex items-start gap-2 text-xs">
              <span className={active && profile.features[key] ? "text-success" : "text-ink-dim"}>
                {active && profile.features[key] ? "✓" : "—"}
              </span>
              <span className={active && profile.features[key] ? "text-ink-muted" : "text-ink-dim"}>
                {FEATURE_LABELS[key]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Button
        variant="ghost"
        size="md"
        className="w-full mt-5"
        icon={<LogOut className="h-4 w-4" />}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onSignOut().finally(() => setBusy(false));
        }}
      >
        Sign out
      </Button>
    </>
  );
}

function SignInForm({
  onSignIn,
  onSignUp,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);

  const submit = () => {
    setError(null);
    setBusy(true);
    const action = mode === "in" ? onSignIn(email, password) : onSignUp(email, password);
    action
      .then(() => {
        if (mode === "up") setSignedUp(true);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  if (signedUp) {
    return (
      <>
        <SectionTitle accent="hextech">Check your email</SectionTitle>
        <Muted>We sent a confirmation link to {email}. Confirm it, then sign in.</Muted>
        <Button variant="ghost" size="md" className="w-full mt-4" onClick={() => setSignedUp(false)}>
          Back to sign in
        </Button>
      </>
    );
  }

  return (
    <>
      <SectionTitle accent="hextech">{mode === "in" ? "Sign in" : "Create an account"}</SectionTitle>

      <div className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="w-full rounded-xl border border-hairline bg-white/[0.03] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim outline-none focus:border-hextech/50"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          onKeyDown={(event) => event.key === "Enter" && submit()}
          className="w-full rounded-xl border border-hairline bg-white/[0.03] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim outline-none focus:border-hextech/50"
        />
      </div>

      {error && <p className="text-danger text-xs mt-3">{error}</p>}

      <Button
        variant="hextech"
        size="md"
        className="w-full mt-4"
        icon={<Mail className="h-4 w-4" />}
        disabled={busy || !email || !password}
        onClick={submit}
      >
        {mode === "in" ? "Sign in" : "Sign up"}
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError(null);
        }}
        className="w-full mt-3 text-center text-xs text-ink-dim hover:text-ink-muted transition-colors"
      >
        {mode === "in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </>
  );
}

function Row({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "success" | "dim" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "dim" ? "text-ink-dim" : "text-ink";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-dim">{label}</span>
      <span className={`font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}
