import { useEffect, useState } from "react";
import { Gamepad2, Loader2, QrCode } from "lucide-react";
import { PairingCard } from "./components/PairingCard";
import { StatusCard } from "./components/StatusCard";
import { UpdateBanner } from "./components/UpdateBanner";
import type { UpdateStatus } from "../../main/updateCheck";
import { ActivityLog } from "./components/ActivityLog";
import type { AgentState } from "../../../../agent/src/types";

type Tab = "remote" | "pairing";

// Remembered across launches so the app reopens on whichever half you were
// actually using, rather than always defaulting back to pairing.
const TAB_KEY = "lol-remote:desktopTab";

function loadTab(): Tab {
  return localStorage.getItem(TAB_KEY) === "pairing" ? "pairing" : "remote";
}

export default function App() {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [port, setPort] = useState(8777);
  const [state, setState] = useState<AgentState | null>(null);
  const [connectedPhones, setConnectedPhones] = useState(0);
  const [connectedClients, setConnectedClients] = useState<{ kind: string; label: string }[]>([]);
  const [servingWebApp, setServingWebApp] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [tab, setTab] = useState<Tab>(loadTab);

  useEffect(() => {
    void window.api.getInfo().then((info) => {
      setPairingCode(info.pairingCode);
      setAddresses(info.addresses);
      setPort(info.port);
      setState(info.state);
      setConnectedPhones(info.connectedPhones);
      setConnectedClients(info.connectedClients);
      setServingWebApp(info.servingWebApp);
    });

    return window.api.onState((push) => {
      setState(push.state);
      setConnectedPhones(push.connectedPhones);
      setConnectedClients(push.connectedClients);
      setUpdate(push.update);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  if (!pairingCode) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-hextech animate-spin" />
      </div>
    );
  }

  // Same page a phone gets from the QR — loaded straight from the agent's own
  // local server, so the Remote control tab is the actual web app, not a copy
  // of it. Pre-authenticated with the pairing code, same as a scanned QR.
  const remoteUrl = `http://127.0.0.1:${port}/?code=${encodeURIComponent(pairingCode)}`;
  const showRemoteTab = servingWebApp && tab === "remote";

  return (
    <div className="h-full flex flex-col">
      {showRemoteTab ? (
        <iframe
          key={remoteUrl}
          src={remoteUrl}
          title="LoL Remote control"
          className="flex-1 w-full border-0 bg-transparent"
        />
      ) : (
        // Two layers on purpose. The outer one scrolls; the inner one is at
        // least a full window tall so the activity log can still stretch into
        // spare space when there is any. Shrink the window past what the
        // cards need and the page scrolls instead of squashing them into
        // their own overflow-hidden corners, which is what a single h-full
        // flex column did.
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="min-h-full flex flex-col gap-4 p-5 max-w-[460px] mx-auto">
            <PairingCard
              pairingCode={pairingCode}
              addresses={addresses}
              port={port}
              servingWebApp={servingWebApp}
              onRegenerate={async () => {
                const next = await window.api.regenerateCode();
                setPairingCode(next);
              }}
            />

            <UpdateBanner update={update} />

            <StatusCard state={state} connectedPhones={connectedPhones} connectedClients={connectedClients} />

            <ActivityLog log={state?.log ?? []} />

            <footer className="text-center text-[11px] text-ink-dim shrink-0">
              Keep this open while you play — minimizes to the tray.
            </footer>
          </div>
        </div>
      )}

      {/* A slim strip rather than a full header — the old one was mostly dead
          space. Kept outside the iframe's own box (not floated on top of it)
          because iframes can swallow clicks meant for an overlapping overlay
          regardless of z-index. */}
      {servingWebApp && (
        <div className="flex h-10 items-center justify-end px-3 border-t border-hairline">
          <button
            type="button"
            onClick={() => setTab(tab === "remote" ? "pairing" : "remote")}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-dim hover:text-hextech transition-colors"
          >
            {tab === "remote" ? (
              <QrCode className="h-3.5 w-3.5" />
            ) : (
              <Gamepad2 className="h-3.5 w-3.5" />
            )}
            {tab === "remote" ? "Pairing" : "Remote control"}
          </button>
        </div>
      )}
    </div>
  );
}
