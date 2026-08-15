import { useState } from "react";
import { motion } from "framer-motion";
import { Wifi, KeyRound, ArrowRight, Loader2 } from "lucide-react";
import { ping, verify, type Connection } from "../lib/api";
import { Button } from "./ui/Button";
import leagueIcon from "../assets/league-icon.png";

export function ConnectScreen({ onConnected }: { onConnected: (connection: Connection) => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8777");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const trimmedHost = host.trim();
    const trimmedPort = Number(port);
    const trimmedCode = code.trim();

    if (!trimmedHost || !trimmedPort || trimmedCode.length !== 6) {
      setError("Enter the IP, port, and 6-digit pairing code from the agent window.");
      return;
    }

    setBusy(true);
    try {
      const found = await ping(trimmedHost, trimmedPort);
      if (!found) {
        setError("No agent found at that address. Check it's running and you're on the same Wi-Fi.");
        return;
      }
      const connection: Connection = { host: trimmedHost, port: trimmedPort, code: trimmedCode };
      const ok = await verify(connection);
      if (!ok) {
        setError("Wrong pairing code.");
        return;
      }
      onConnected(connection);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-svh flex items-center justify-center px-6 py-12 overflow-hidden">
      <BackgroundGlow />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-8">
          <motion.div
            animate={{ boxShadow: ["0 0 20px rgba(10,200,185,0.35)", "0 0 40px rgba(10,200,185,0.6)", "0 0 20px rgba(10,200,185,0.35)"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="h-16 w-16 rounded-2xl border border-hextech/40 overflow-hidden mb-5"
          >
            <img src={leagueIcon} alt="" className="h-full w-full object-cover" />
          </motion.div>
          <h1 className="text-2xl font-extrabold tracking-[0.08em] uppercase text-ink text-glow-hextech">LoL Remote</h1>
          <p className="text-ink-dim text-sm mt-2 text-center">Connect to the agent running on your gaming PC.</p>
        </div>

        <div className="glass rounded-3xl p-6 space-y-4">
          <Field icon={<Wifi className="h-4 w-4" />} label="PC address">
            <div className="flex gap-2">
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.20"
                inputMode="decimal"
                className="min-w-0 flex-1 bg-transparent outline-none text-ink placeholder:text-ink-dim/60"
              />
              <span className="text-ink-dim">:</span>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="8777"
                inputMode="numeric"
                className="w-16 bg-transparent outline-none text-ink placeholder:text-ink-dim/60"
              />
            </div>
          </Field>

          <Field icon={<KeyRound className="h-4 w-4" />} label="Pairing code">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              className="w-full bg-transparent outline-none text-ink placeholder:text-ink-dim/60 tracking-[0.3em] text-lg font-mono"
            />
          </Field>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-danger text-xs leading-relaxed">
              {error}
            </motion.p>
          )}

          <Button variant="hextech" size="lg" className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </div>

        <p className="text-ink-dim/70 text-xs text-center mt-6">
          Run <code className="text-ink-muted">npm run dev</code> in <code className="text-ink-muted">agent/</code> on your PC to get these values.
        </p>
      </motion.div>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim mb-1.5">
        {icon}
        {label}
      </label>
      <div className="rounded-xl border border-hairline bg-white/[0.03] px-3.5 py-3 focus-within:border-hextech/50 transition-colors">
        {children}
      </div>
    </div>
  );
}

function BackgroundGlow() {
  return (
    <div className="absolute inset-0 -z-0 overflow-hidden">
      <motion.div
        animate={{ x: [0, 40, 0], y: [0, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-hextech/10 blur-[100px]"
      />
      <motion.div
        animate={{ x: [0, -30, 0], y: [0, 30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-gold/10 blur-[100px]"
      />
    </div>
  );
}
