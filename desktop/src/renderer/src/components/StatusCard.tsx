import { Gamepad2, Smartphone } from "lucide-react";
import { Card, SectionTitle, StatusDot } from "./primitives";
import type { AgentState } from "../../../../../agent/src/types";

const PHASE_LABEL: Record<string, string> = {
  None: "Idle",
  Lobby: "In lobby",
  Matchmaking: "Finding a match",
  ReadyCheck: "Ready check!",
  ChampSelect: "Champion select",
  GameStart: "Game starting",
  InProgress: "In game",
  Reconnect: "Reconnecting",
  WaitingForStats: "Waiting for stats",
  PreEndOfGame: "Post-game",
  EndOfGame: "Post-game",
  TerminatedInError: "Error",
};

/**
 * Names what is connected instead of counting it.
 *
 * "Phone: 2 connected" was wrong twice over when one of them was a browser on
 * this very desk. Identical kinds are folded together — "2 phone browsers"
 * rather than the same words twice — and several different ones are listed,
 * since which is which is the whole point of asking.
 */
function describeClients(clients: { label: string }[]): string {
  if (clients.length === 0) return "Not connected";

  const counts = new Map<string, number>();
  for (const client of clients) counts.set(client.label, (counts.get(client.label) ?? 0) + 1);

  return [...counts.entries()]
    .map(([label, count]) => (count === 1 ? label : `${count} × ${label}`))
    .join(", ");
}

export function StatusCard({
  state,
  connectedPhones,
  connectedClients,
}: {
  state: AgentState | null;
  connectedPhones: number;
  connectedClients: { kind: string; label: string }[];
}) {
  const clientOk = state?.connectedToClient ?? false;

  return (
    <Card>
      <SectionTitle>Status</SectionTitle>
      <div className="space-y-3">
        <Row
          icon={<Gamepad2 className="h-4 w-4" />}
          label="League client"
          value={clientOk ? (PHASE_LABEL[state?.phase ?? "None"] ?? state?.phase ?? "Connected") : "Not running"}
          dot={clientOk ? "success" : "danger"}
        />
        <Row
          icon={<Smartphone className="h-4 w-4" />}
          label={connectedPhones === 1 ? "Remote" : "Remotes"}
          value={describeClients(connectedClients)}
          dot={connectedPhones > 0 ? "hextech" : "dim"}
        />
      </div>

      {state?.summoner && (
        <div className="mt-4 pt-4 border-t border-hairline flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_rgba(200,155,60,0.8)]" />
          <span className="text-gold font-semibold text-sm">{state.summoner.displayName}</span>
        </div>
      )}
    </Card>
  );
}

function Row({
  icon,
  label,
  value,
  dot,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dot: "success" | "hextech" | "danger" | "dim";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <StatusDot color={dot} />
      <span className="text-ink-muted text-sm flex-1 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-ink text-sm font-medium">{value}</span>
    </div>
  );
}
