import { LogOut } from "lucide-react";
import type { LinkStatus } from "../hooks/useAgent";
import { StatusDot } from "./ui/primitives";
import leagueIcon from "../assets/league-icon.png";

export function TopBar({ status, onDisconnect }: { status: LinkStatus; onDisconnect: () => void }) {
  return (
    <header className="sticky top-0 z-30 glass border-b border-hairline">
      <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src={leagueIcon} alt="" className="h-8 w-8 rounded-lg border border-hextech/40 object-cover" />
          <span className="font-display font-bold tracking-[0.22em] uppercase text-sm text-ink">LoL Remote</span>
        </div>

        <div className="flex items-center gap-4">
          <div
            className={`hidden sm:flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] px-3 py-1.5 rounded-full border ${
              status === "online"
                ? "text-success bg-success/10 border-success/35"
                : status === "connecting"
                  ? "text-gold bg-gold/10 border-gold/35"
                  : "text-danger bg-danger/10 border-danger/35"
            }`}
          >
            <StatusDot color={status === "online" ? "success" : status === "connecting" ? "gold" : "danger"} pulse={status === "connecting"} />
            {status === "online" ? "Online" : status === "connecting" ? "Connecting…" : "Offline"}
          </div>
          <button onClick={onDisconnect} className="text-ink-dim hover:text-danger transition-colors" title="Disconnect">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
