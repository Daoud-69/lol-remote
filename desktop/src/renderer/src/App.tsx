import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PairingCard } from "./components/PairingCard";
import { StatusCard } from "./components/StatusCard";
import { ActivityLog } from "./components/ActivityLog";
import type { AgentState } from "../../../../agent/src/types";

export default function App() {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [port, setPort] = useState(8777);
  const [state, setState] = useState<AgentState | null>(null);
  const [connectedPhones, setConnectedPhones] = useState(0);

  useEffect(() => {
    void window.api.getInfo().then((info) => {
      setPairingCode(info.pairingCode);
      setAddresses(info.addresses);
      setPort(info.port);
      setState(info.state);
      setConnectedPhones(info.connectedPhones);
    });

    return window.api.onState((push) => {
      setState(push.state);
      setConnectedPhones(push.connectedPhones);
    });
  }, []);

  if (!pairingCode) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-hextech animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative z-10 h-full flex flex-col gap-4 p-5">
      <header className="flex items-center gap-2.5 shrink-0">
        <span className="h-2 w-2 rounded-full bg-hextech shadow-[0_0_10px_rgba(10,200,185,0.8)] animate-pulse-glow" />
        <h1 className="font-display text-sm font-bold uppercase tracking-[0.3em] text-ink-muted">
          LoL Remote
        </h1>
      </header>

      <PairingCard
        pairingCode={pairingCode}
        addresses={addresses}
        port={port}
        onRegenerate={async () => {
          const next = await window.api.regenerateCode();
          setPairingCode(next);
        }}
      />

      <StatusCard state={state} connectedPhones={connectedPhones} />

      <ActivityLog log={state?.log ?? []} />

      <footer className="text-center text-[11px] text-ink-dim shrink-0">
        Keep this open while you play — minimizes to the tray.
      </footer>
    </div>
  );
}
