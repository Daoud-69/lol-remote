import { lazy, Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Wifi, KeyRound, ArrowRight, Loader2, QrCode } from "lucide-react";
import { ping, verify, agentServedThisPage, pairingLinkFromLocation, type Connection } from "../lib/api";
import { Button } from "./ui/Button";
import leagueIcon from "../assets/league-icon.png";

// The scanner drags in a QR decoder, and most people never open it — the
// browser route is a camera app following the link, and the app route is one
// tap that can afford to fetch this. Keeping it out of the initial bundle
// matters when the phone is pulling that bundle over the LAN.
const QrScanner = lazy(() =>
  import("./QrScanner").then((module) => ({ default: module.QrScanner })),
);

export function ConnectScreen({ onConnected }: { onConnected: (connection: Connection) => void }) {
  const selfServed = agentServedThisPage();
  // A camera app that scanned the agent's QR opens this page at the pairing
  // link, so the address bar already holds every answer the form asks for.
  const [scanned] = useState(pairingLinkFromLocation);

  // When the agent serves this page itself, the address bar already has the
  // answer — no reason to make anyone type it.
  const [host, setHost] = useState(selfServed ? window.location.hostname : "");
  const [port, setPort] = useState(selfServed ? window.location.port || "8777" : "8777");
  const [code, setCode] = useState(scanned?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoConnecting, setAutoConnecting] = useState(Boolean(scanned));
  const [scannerOpen, setScannerOpen] = useState(false);

  // No point offering a scanner the platform will not let us open. It exists
  // for the installed app, which runs on a localhost origin; loaded from the
  // agent over plain HTTP the camera API is not there at all, and that route
  // does not need it — the phone's own camera app opens the link.
  const cameraAvailable = Boolean(navigator.mediaDevices?.getUserMedia);

  /**
   * The one way in, whether the details were typed, scanned, or carried by the
   * link this page was opened with. Ping first so "the agent isn't running"
   * and "wrong code" stay distinguishable — they need different fixes.
   */
  const connectTo = async (connection: Connection): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      if (!(await ping(connection.host, connection.port))) {
        setError("No agent found at that address. Check it's running and you're on the same Wi-Fi.");
        return;
      }
      if (!(await verify(connection))) {
        setError("Wrong pairing code.");
        return;
      }
      onConnected(connection);
    } finally {
      setBusy(false);
      // Whatever happened, the automatic attempt is over: either we're gone,
      // or the form needs to come back so it can be fixed by hand.
      setAutoConnecting(false);
    }
  };

  // A scanned link should just connect, with the form appearing only if it
  // didn't work — and then with the code already filled in.
  useEffect(() => {
    if (scanned) void connectTo(scanned);
    // Runs once, for the link this page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    const trimmedHost = host.trim();
    const trimmedPort = Number(port);
    const trimmedCode = code.trim();

    if (!trimmedHost || !trimmedPort || trimmedCode.length !== 6) {
      setError("Enter the IP, port, and 6-digit pairing code from the agent window.");
      return;
    }
    void connectTo({ host: trimmedHost, port: trimmedPort, code: trimmedCode });
  };

  const onScanned = (connection: Connection) => {
    setScannerOpen(false);
    // Mirror the scan into the form, so a failure leaves something to correct
    // rather than an empty box.
    setHost(connection.host);
    setPort(String(connection.port));
    setCode(connection.code);
    void connectTo(connection);
  };

  if (autoConnecting) {
    return (
      <div className="relative min-h-svh flex flex-col items-center justify-center gap-4 px-6 overflow-hidden">
        <BackgroundGlow />
        <Loader2 className="relative z-10 h-7 w-7 text-hextech animate-spin" />
        <p className="relative z-10 text-ink-muted text-sm">Pairing with your PC…</p>
      </div>
    );
  }

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

        {cameraAvailable && (
          <div className="mb-5">
            <Button variant="hextech" size="lg" className="w-full" disabled={busy} onClick={() => setScannerOpen(true)}>
              <QrCode className="h-4 w-4" />
              Scan the QR code
            </Button>
            <p className="text-ink-dim/70 text-xs text-center mt-2">
              It's in the agent window on your PC.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <span className="h-px flex-1 bg-hairline" />
              <span className="text-ink-dim/70 text-[11px] uppercase tracking-wider">or type it in</span>
              <span className="h-px flex-1 bg-hairline" />
            </div>
          </div>
        )}

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

          <Button variant={cameraAvailable ? "ghost" : "hextech"} size="lg" className="w-full" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </div>

        <p className="text-ink-dim/70 text-xs text-center mt-6">
          Open the LoL Remote agent on your PC to get these — it shows a QR code, an address and a code.
        </p>
      </motion.div>

      <AnimatePresence>
        {scannerOpen && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-hextech animate-spin" />
              </div>
            }
          >
            <QrScanner onResult={onScanned} onClose={() => setScannerOpen(false)} />
          </Suspense>
        )}
      </AnimatePresence>
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
