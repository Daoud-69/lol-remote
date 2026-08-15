import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Card, IconButton, SectionTitle } from "./primitives";

export function PairingCard({
  pairingCode,
  addresses,
  port,
  onRegenerate,
}: {
  pairingCode: string;
  addresses: string[];
  port: number;
  onRegenerate: () => Promise<void>;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  return (
    <Card className="relative overflow-hidden">
      <SectionTitle accent="gold">Pairing code</SectionTitle>

      <div className="flex items-center justify-between gap-3">
        <span className="select-text font-display text-glow-gold text-gold text-[52px] leading-none font-bold tracking-[0.14em] tabular-nums">
          {pairingCode}
        </span>
        <CopyButton value={pairingCode} />
      </div>

      <p className="text-ink-dim text-xs mt-2 leading-relaxed">
        Enter this in the phone app, on the same Wi-Fi.
      </p>

      <div className="mt-4 pt-4 border-t border-hairline space-y-2">
        {addresses.length === 0 ? (
          <p className="text-danger text-xs">No network interface found.</p>
        ) : (
          addresses.map((address) => (
            <div key={address} className="flex items-center justify-between gap-3">
              <span className="select-text font-display text-ink-muted text-sm tracking-wide tabular-nums">
                {address}:{port}
              </span>
              <CopyButton value={`${address}:${port}`} small />
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-hairline flex items-center justify-between">
        <span className="text-ink-dim text-xs">Phone stuck on the old code?</span>
        {confirmingReset ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-[11px] font-bold uppercase tracking-wider text-danger hover:text-danger/80"
              disabled={regenerating}
              onClick={() => {
                setRegenerating(true);
                void onRegenerate().finally(() => {
                  setRegenerating(false);
                  setConfirmingReset(false);
                });
              }}
            >
              {regenerating ? "Resetting…" : "Confirm reset"}
            </button>
            <button
              type="button"
              className="text-[11px] uppercase tracking-wider text-ink-dim hover:text-ink-muted"
              onClick={() => setConfirmingReset(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted hover:text-gold transition-colors"
            onClick={() => setConfirmingReset(true)}
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </button>
        )}
      </div>
    </Card>
  );
}

function CopyButton({ value, small = false }: { value: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void window.api.copy(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  if (small) {
    return (
      <button
        type="button"
        onClick={copy}
        className="text-ink-dim hover:text-hextech transition-colors"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <IconButton onClick={copy} title="Copy pairing code">
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </IconButton>
  );
}
