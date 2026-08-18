import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { api, pairingLinkFromLocation, sameConnection, type Connection } from "./lib/api";
import type { Champion, SummonerSpell } from "./types";
import { useAgent } from "./hooks/useAgent";
import { useWakeLock } from "./hooks/useWakeLock";
import { ConnectScreen } from "./components/ConnectScreen";
import { TopBar } from "./components/TopBar";
import { BottomNav, type Tab } from "./components/BottomNav";
import { ReadyCheckOverlay } from "./components/ReadyCheckOverlay";
import { Toast } from "./components/Toast";
import { StatusPanel } from "./components/panels/StatusPanel";
import { ChampSelectPanel } from "./components/panels/ChampSelectPanel";
import { AutomationPanel } from "./components/panels/AutomationPanel";

const STORAGE_KEY = "lol-remote:connection";

export default function App() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState<Tab>("status");
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "error" } | null>(null);

  const [champions, setChampions] = useState<Champion[]>([]);
  const [spells, setSpells] = useState<SummonerSpell[]>([]);

  const { state, status, lastAlert, clearAlert } = useAgent(connection);
  useWakeLock(state?.phase === "ChampSelect" || state?.readyCheck?.state === "InProgress");

  useEffect(() => {
    let saved: Connection | null = null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        saved = JSON.parse(stored) as Connection;
      } catch {
        /* ignore corrupt storage */
      }
    }

    // A pairing link in the address bar outranks whatever we remembered. That
    // is the whole point of re-scanning: the agent's code was regenerated, or
    // its address moved, and the saved connection is the stale one. Leaving
    // `connection` null hands it to the connect screen, which verifies the
    // link before saving it over the old one.
    const link = pairingLinkFromLocation();
    if (!link || sameConnection(link, saved)) setConnection(saved);

    setRestoring(false);
  }, []);

  const connect = (next: Connection) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setConnection(next);

    // The pairing code has done its job; leaving it in the address bar leaves
    // it in history and in anything the browser syncs, and a refresh would
    // re-run the whole pairing dance for a connection already saved.
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  const disconnect = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConnection(null);
    setChampions([]);
    setSpells([]);
  };

  const showToast = useCallback((message: string, kind: "ok" | "error") => {
    setToast({ message, kind });
  }, []);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  // Catalogs load once the client is up.
  useEffect(() => {
    if (!connection || !state?.connectedToClient) return;
    if (champions.length > 0 && spells.length > 0) return;
    void (async () => {
      try {
        const [nextChampions, nextSpells] = await Promise.all([api.champions(connection), api.spells(connection)]);
        setChampions(nextChampions);
        setSpells(nextSpells);
      } catch {
        /* the connection card already surfaces the disconnected state */
      }
    })();
  }, [connection, state?.connectedToClient, champions.length, spells.length]);

  // Jump straight to champ select on mobile when it starts.
  useEffect(() => {
    if (state?.phase !== "ChampSelect" || !connection) return;
    setTab("select");
    void api.champions(connection).then(setChampions).catch(() => undefined);
  }, [state?.phase, connection]);

  // Pickable/bannable flags are a snapshot from the moment they're fetched —
  // stale the instant someone else picks or bans. Re-fetch right as our turn
  // starts so the grid reflects what's actually still available, instead of
  // whatever was true whenever champ select happened to begin.
  const myActionId = state?.champSelect?.myAction?.id;
  const myActionInProgress = state?.champSelect?.myAction?.isInProgress;
  useEffect(() => {
    if (!connection || !myActionInProgress) return;
    void api.champions(connection).then(setChampions).catch(() => undefined);
  }, [connection, myActionId, myActionInProgress]);

  const readyCheckPending = state?.readyCheck?.state === "InProgress" && state.readyCheck.playerResponse === "None";
  const [acceptBusy, setAcceptBusy] = useState(false);
  const secondsLeft = Math.max(0, 12 - Math.floor(state?.readyCheck?.timer ?? 0));

  /** One path for answering the ready check, shared by both layouts. */
  const respond = useCallback(
    (answer: "accept" | "decline") => {
      if (!connection) return;
      setAcceptBusy(true);
      const call = answer === "accept" ? api.accept : api.decline;
      void call(connection)
        .then(() => showToast(answer === "accept" ? "Accepted." : "Declined.", "ok"))
        .catch((error: Error) => showToast(error.message, "error"))
        .finally(() => setAcceptBusy(false));
    },
    [connection, showToast],
  );

  if (restoring) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-obsidian">
        <Loader2 className="h-6 w-6 text-hextech animate-spin" />
      </div>
    );
  }

  if (!connection) {
    return <ConnectScreen onConnected={connect} />;
  }

  return (
    <div className="min-h-svh flex flex-col">
      <TopBar status={status} onDisconnect={disconnect} />

      <div className="flex-1 max-w-6xl 2xl:max-w-[1600px] w-full mx-auto px-5 lg:px-8 py-6 pb-28 lg:pb-10">
        {state ? (
          <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-8 lg:items-start">
            {/* Desktop sidebar: settings live here, always visible. */}
            <aside className="hidden lg:block sticky top-22">
              <AutomationPanel state={state} connection={connection} champions={champions} spells={spells} onToast={showToast} />
            </aside>

            {/* Desktop main column: live visualizer, auto-switches to champ select. */}
            <main className="hidden lg:block space-y-6">
              <StatusPanel state={state} status={status} connection={connection} onToast={showToast} />
              <AnimatePresence>
                {state.champSelect && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <ChampSelectPanel state={state} connection={connection} champions={champions} spells={spells} onToast={showToast} />
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {/* Mobile: one tab at a time. */}
            <div className="lg:hidden">
              <AnimatePresence mode="wait">
                {tab === "status" && (
                  <motion.div key="status" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.25 }}>
                    <StatusPanel state={state} status={status} connection={connection} onToast={showToast} />
                  </motion.div>
                )}
                {tab === "select" && (
                  <motion.div key="select" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.25 }}>
                    <ChampSelectPanel state={state} connection={connection} champions={champions} spells={spells} onToast={showToast} />
                  </motion.div>
                )}
                {tab === "auto" && (
                  <motion.div key="auto" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.25 }}>
                    <AutomationPanel state={state} connection={connection} champions={champions} spells={spells} onToast={showToast} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 text-hextech animate-spin" />
          </div>
        )}
      </div>

      <BottomNav tab={tab} onChange={setTab} />

      <ReadyCheckOverlay
        visible={Boolean(readyCheckPending)}
        secondsLeft={secondsLeft}
        busy={acceptBusy}
        onAccept={() => respond("accept")}
        onDecline={() => respond("decline")}
      />

      <AnimatePresence>
        {lastAlert && !readyCheckPending && (
          <motion.button
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            onClick={clearAlert}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-40 glass rounded-full px-5 py-2.5 text-sm font-semibold text-gold shadow-xl"
          >
            {lastAlert}
          </motion.button>
        )}
      </AnimatePresence>

      <Toast toast={toast} />
    </div>
  );
}
