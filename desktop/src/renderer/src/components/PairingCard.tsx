import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Card, IconButton, SectionTitle } from "./primitives";

export function PairingCard({
  pairingCode,
  addresses,
  port,
  servingWebApp,
  onRegenerate,
}: {
  pairingCode: string;
  addresses: string[];
  port: number;
  servingWebApp: boolean;
  onRegenerate: () => Promise<void>;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [selected, setSelected] = useState(0);
  const [qr, setQr] = useState<string | null>(null);

  // Several interfaces is the normal case on a gaming PC — Ethernet and Wi-Fi,
  // plus whatever a VM or VPN adapter adds — and only the person looking at the
  // screen knows which one their phone is on. So the QR follows the selection
  // rather than guessing.
  const address = addresses[selected] as string | undefined;

  useEffect(() => {
    if (selected >= addresses.length) setSelected(0);
  }, [addresses.length, selected]);

  useEffect(() => {
    if (!address) {
      setQr(null);
      return;
    }
    let live = true;
    // pairingCode is not passed in — the main process reads it itself — but a
    // regenerated code changes what comes back, so it belongs in the deps.
    void window.api
      .pairingQr(address)
      .then((result) => {
        if (live) setQr(result.dataUrl);
      })
      .catch(() => {
        if (live) setQr(null);
      });
    return () => {
      live = false;
    };
  }, [address, pairingCode]);

  return (
    <Card className="relative overflow-hidden">
      <SectionTitle accent="hextech">
        {servingWebApp ? "Scan to connect" : "Address"}
      </SectionTitle>

      {addresses.length === 0 ? (
        <p className="text-danger text-xs">No network interface found.</p>
      ) : (
        <div className="flex gap-4">
          <QrPanel dataUrl={qr} />

          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className="space-y-1">
              {addresses.map((candidate, index) => (
                <AddressRow
                  key={candidate}
                  address={`http://${candidate}:${port}`}
                  selected={index === selected}
                  selectable={addresses.length > 1}
                  onSelect={() => setSelected(index)}
                />
              ))}
            </div>

            <p className="text-ink-dim text-xs mt-2.5 leading-relaxed">
              {servingWebApp
                ? "Point your phone's camera at this — it opens the remote and pairs itself. Same Wi-Fi as this PC."
                : "Web app not bundled with this build. Scan this from the LoL Remote app's connect screen instead."}
            </p>

            {addresses.length > 1 && (
              <p className="text-ink-dim/70 text-[11px] mt-1.5 leading-relaxed">
                Phone can't reach it? Tap another address.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-hairline">
        <SectionTitle accent="gold">Pairing code</SectionTitle>
        <div className="flex items-center justify-between gap-3">
          <span className="select-text font-display text-glow-gold text-gold text-[34px] leading-none font-bold tracking-[0.14em] tabular-nums">
            {pairingCode}
          </span>
          <CopyButton value={pairingCode} />
        </div>
        <p className="text-ink-dim text-xs mt-2 leading-relaxed">
          Only needed if you type the address in by hand instead of scanning.
        </p>
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

/**
 * White plate on purpose. The rest of the window is near-black, but a QR
 * inverted to match it is a coin flip on whether a given phone camera reads it,
 * and a code that only sometimes scans is worse than no code at all.
 */
function QrPanel({ dataUrl }: { dataUrl: string | null }) {
  return (
    <div className="shrink-0 h-[132px] w-[132px] rounded-xl bg-white p-2 shadow-[0_0_24px_rgba(10,200,185,0.18)]">
      {dataUrl ? (
        <img src={dataUrl} alt="Pairing QR code" className="h-full w-full" />
      ) : (
        <div className="h-full w-full animate-pulse rounded-md bg-black/10" />
      )}
    </div>
  );
}

function AddressRow({
  address,
  selected,
  selectable,
  onSelect,
}: {
  address: string;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {selectable ? (
        <button
          type="button"
          onClick={onSelect}
          title="Show this address in the QR code"
          className={`min-w-0 truncate text-left font-display text-xs tracking-wide tabular-nums transition-colors ${
            selected ? "text-ink" : "text-ink-dim hover:text-ink-muted"
          }`}
        >
          {selected && <span className="text-hextech mr-1.5">▸</span>}
          {address}
        </button>
      ) : (
        <span className="min-w-0 truncate select-text font-display text-ink text-sm tracking-wide tabular-nums">
          {address}
        </span>
      )}
      <CopyButton value={address} small />
    </div>
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
        className="shrink-0 text-ink-dim hover:text-hextech transition-colors"
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
