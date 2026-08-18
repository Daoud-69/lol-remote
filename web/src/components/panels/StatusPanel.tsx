import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, Loader2, PlayCircle, Radar, Swords, Wifi, WifiOff } from "lucide-react";
import type { AgentState, GameflowPhase } from "../../types";
import type { LinkStatus } from "../../hooks/useAgent";
import type { Connection } from "../../lib/api";
import { api, profileIconUrl } from "../../lib/api";
import { Button } from "../ui/Button";
import { Card, Muted, SectionTitle, StatusDot } from "../ui/primitives";
import { ModePicker } from "../ModePicker";
import { FriendsCard } from "../FriendsCard";

export function StatusPanel({
  state,
  status,
  connection,
  onToast,
}: {
  state: AgentState | null;
  status: LinkStatus;
  connection: Connection;
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      onToast(success, "ok");
    } catch (error) {
      onToast((error as Error).message, "error");
    }
  };

  const linkOk = status === "online";
  const clientOk = state?.connectedToClient ?? false;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>Connection</SectionTitle>
        <div className="space-y-3">
          <Row
            icon={linkOk ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            label="Phone → PC agent"
            value={status === "online" ? "Connected" : status === "connecting" ? "Connecting…" : "Offline"}
            dot={linkOk ? "success" : status === "connecting" ? "gold" : "danger"}
            pulse={status === "connecting"}
          />
          <Row
            icon={<Gamepad2 className="h-4 w-4" />}
            label="Agent → League client"
            value={clientOk ? "Connected" : "Not running"}
            dot={clientOk ? "success" : "danger"}
          />
        </div>

        {state?.summoner && (
          <div className="mt-4 pt-4 border-t border-hairline flex items-center gap-3">
            <img
              src={profileIconUrl(connection, state.summoner.profileIconId)}
              alt=""
              className="h-10 w-10 rounded-full border border-gold/40"
            />
            <span className="text-gold font-semibold text-sm">{state.summoner.displayName}</span>
          </div>
        )}
      </Card>

      {clientOk ? (
        <ModePicker
          connection={connection}
          currentQueueId={state?.lobby?.queueId ?? 0}
          currentQueueName={state?.lobby?.queueName ?? ""}
          canChange={state?.phase === "None" || state?.phase === "Lobby" || state?.phase === "Matchmaking"}
          onToast={onToast}
        />
      ) : (
        <Card>
          <SectionTitle accent="hextech">Game mode</SectionTitle>
          <Muted>Open the League client on your PC to pick a mode.</Muted>
        </Card>
      )}

      {clientOk ? (
        <FriendsCard
          connection={connection}
          canJoin={state?.phase === "None" || state?.phase === "Lobby" || state?.phase === "Matchmaking"}
          inLobby={Boolean(state?.lobby)}
          onToast={onToast}
        />
      ) : (
        <Card>
          <SectionTitle accent="gold">Friends</SectionTitle>
          <Muted>Open the League client on your PC to invite friends.</Muted>
        </Card>
      )}

      <Card>
        <SectionTitle accent="gold">Right now</SectionTitle>
        <PhaseVisualizer phase={state?.phase ?? "None"} connected={clientOk} />

        {state?.phase === "Lobby" && (
          <Button variant="hextech" size="md" className="w-full mt-4" onClick={() => void run(() => api.startQueue(connection), "Queue started.")}>
            <PlayCircle className="h-4 w-4" />
            Start queue
          </Button>
        )}
        {state?.phase === "Matchmaking" && (
          <Button variant="ghost" size="md" className="w-full mt-4" onClick={() => void run(() => api.stopQueue(connection), "Queue stopped.")}>
            Stop queue
          </Button>
        )}
        {state?.phase === "Lobby" && (
          <button
            type="button"
            className="w-full mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-dim hover:text-danger transition-colors"
            onClick={() => void run(() => api.leaveQueue(connection), "Left the lobby.")}
          >
            Leave lobby
          </button>
        )}
      </Card>

      <Card>
        <SectionTitle>Agent activity</SectionTitle>
        {state && state.log.length > 0 ? (
          <div className="space-y-2.5 max-h-64 overflow-y-auto no-scrollbar">
            {state.log.slice(0, 14).map((entry) => (
              <div key={`${entry.at}-${entry.message}`} className="flex gap-3 text-xs">
                <span className="text-ink-dim tabular-nums shrink-0">
                  {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-ink-muted leading-relaxed">{entry.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-dim text-sm">Nothing yet.</p>
        )}
      </Card>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  dot,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dot: "success" | "gold" | "danger";
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <StatusDot color={dot} pulse={pulse} />
      <span className="text-ink-muted text-sm flex-1 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={`text-sm font-semibold ${dot === "success" ? "text-success" : dot === "gold" ? "text-gold" : "text-danger"}`}
      >
        {value}
      </span>
    </div>
  );
}

const PHASE_CONFIG: Record<GameflowPhase, { label: string; icon: React.ReactNode }> = {
  None: { label: "Sitting in the client.", icon: <Gamepad2 className="h-6 w-6" /> },
  Lobby: { label: "In a lobby, not queued.", icon: <Gamepad2 className="h-6 w-6" /> },
  Matchmaking: { label: "Searching for a match…", icon: <Radar className="h-6 w-6" /> },
  ReadyCheck: { label: "Match found — waiting for you to accept.", icon: <Swords className="h-6 w-6" /> },
  ChampSelect: { label: "In champion select.", icon: <Swords className="h-6 w-6" /> },
  GameStart: { label: "Game starting…", icon: <PlayCircle className="h-6 w-6" /> },
  InProgress: { label: "Game in progress.", icon: <PlayCircle className="h-6 w-6" /> },
  Reconnect: { label: "Reconnecting to the game…", icon: <Loader2 className="h-6 w-6 animate-spin" /> },
  WaitingForStats: { label: "Game just finished.", icon: <Gamepad2 className="h-6 w-6" /> },
  PreEndOfGame: { label: "Game just finished.", icon: <Gamepad2 className="h-6 w-6" /> },
  EndOfGame: { label: "Game just finished.", icon: <Gamepad2 className="h-6 w-6" /> },
  TerminatedInError: { label: "Something went wrong client-side.", icon: <Gamepad2 className="h-6 w-6" /> },
};

function PhaseVisualizer({ phase, connected }: { phase: GameflowPhase; connected: boolean }) {
  const config = connected ? PHASE_CONFIG[phase] : { label: "The League client is not running on your PC.", icon: <WifiOff className="h-6 w-6" /> };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={connected ? phase : "disconnected"}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-hairline px-4 py-4"
      >
        <span className={connected ? "text-hextech" : "text-ink-dim"}>{config.icon}</span>
        <span className="text-ink text-sm leading-snug">{config.label}</span>
      </motion.div>
    </AnimatePresence>
  );
}
