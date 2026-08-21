import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { championIconUrl, type Connection } from "../lib/api";
import type { Champion } from "../types";

/** Searchable champion grid. `mode` decides which availability flag greys a champion out. */
export function ChampionGrid({
  champions,
  connection,
  selectedId,
  onSelect,
  mode,
}: {
  champions: Champion[];
  connection: Connection;
  selectedId: number;
  onSelect: (championId: number) => void;
  mode: "pick" | "ban";
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return champions;
    return champions.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.alias.toLowerCase().includes(needle),
    );
  }, [champions, query]);

  const isAvailable = (champion: Champion) => {
    const flag = mode === "ban" ? champion.bannable : champion.pickable;
    return flag === undefined ? true : flag;
  };

  return (
    // h-full so the grid fills the fixed-height box both callers wrap it in.
    // Without it this sized to its content and simply overflowed that box —
    // harmless while nothing sat underneath, and an overlap once something did.
    <div className="flex h-full flex-col min-h-0">
      <div className="relative mb-3 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-dim" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 160+ champions…"
          className="w-full rounded-xl border border-hairline bg-white/[0.03] pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:border-hextech/50 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-ink-dim text-sm text-center py-8">No champion matches that.</p>
      ) : (
        // min-h-0 lets this flex child shrink below its content height, which
        // is what turns overflow-y-auto into an actual scroll instead of growth.
        // Fixed column counts are right for a phone, where the width is known
        // and four across is the readable answer. They are wrong above that: a
        // fixed count makes a wider window enlarge each portrait rather than
        // fit more, and every breakpoint band has its own awkward size. So the
        // desktop side asks for a portrait size instead and takes whatever
        // column count that implies.
        <div className="grid min-h-0 grid-cols-4 sm:grid-cols-5 md:grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 overflow-y-auto pr-1 no-scrollbar">
          {filtered.map((champion) => {
            const available = isAvailable(champion);
            const selected = champion.id === selectedId;
            return (
              <motion.button
                key={champion.id}
                type="button"
                disabled={!available}
                onClick={() => onSelect(champion.id)}
                whileHover={available ? { scale: 1.06 } : undefined}
                whileTap={available ? { scale: 0.95 } : undefined}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className={`group flex flex-col items-center gap-1 rounded-xl p-1.5 border transition-colors ${
                  selected
                    ? mode === "ban"
                      ? "border-danger bg-danger/10"
                      : "border-gold bg-gold/10"
                    : "border-transparent hover:border-white/15"
                } ${!available ? "opacity-25 pointer-events-none" : ""}`}
              >
                <img
                  src={championIconUrl(connection, champion.id)}
                  alt={champion.name}
                  loading="lazy"
                  className={`aspect-square w-full rounded-lg bg-obsidian-raised object-cover ${
                    selected ? (mode === "ban" ? "shadow-[0_0_16px_rgba(232,64,87,0.5)]" : "shadow-[0_0_16px_rgba(200,155,60,0.5)]") : ""
                  }`}
                />
                <span className="text-[10px] text-ink-muted truncate w-full text-center">{champion.name}</span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
