import { motion } from "framer-motion";
import { ArrowUp, Plus, X } from "lucide-react";
import { championIconUrl, type Connection } from "../lib/api";
import type { Champion } from "../types";

/**
 * An ordered list of champion choices.
 *
 * Order is the whole point: the agent walks the list and takes the first entry
 * that is still legal, so slot 2 is what you get when slot 1 is banned. The
 * rank badge and the promote arrow exist to make that ordering obvious rather
 * than implied.
 */
export function ChampionSlots({
  championIds,
  champions,
  connection,
  max = 3,
  mode,
  emptyLabel,
  onChange,
  onPick,
}: {
  championIds: number[];
  champions: Champion[];
  connection: Connection;
  max?: number;
  mode: "pick" | "ban";
  emptyLabel: string;
  onChange: (next: number[]) => void;
  onPick: (slotIndex: number) => void;
}) {
  const name = (id: number) => champions.find((c) => c.id === id)?.name ?? `Champion ${id}`;

  const remove = (index: number) => onChange(championIds.filter((_, i) => i !== index));

  const promote = (index: number) => {
    if (index === 0) return;
    const next = [...championIds];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const accent = mode === "ban" ? "text-danger" : "text-gold";
  const ring = mode === "ban" ? "border-danger/40" : "border-gold/40";

  return (
    <div className="space-y-2">
      {championIds.map((championId, index) => (
        <motion.div
          key={`${championId}-${index}`}
          layout
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] p-2"
        >
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${ring} text-[11px] font-bold ${accent}`}
          >
            {index + 1}
          </span>
          <img
            src={championIconUrl(connection, championId)}
            alt=""
            className="h-9 w-9 rounded-lg bg-obsidian-raised"
          />
          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink">
            {name(championId)}
          </span>
          {index > 0 && (
            <button
              type="button"
              onClick={() => promote(index)}
              aria-label={`Move ${name(championId)} up`}
              className="rounded-lg p-1.5 text-ink-dim transition-colors hover:text-ink"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={`Remove ${name(championId)}`}
            className="rounded-lg p-1.5 text-ink-dim transition-colors hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      ))}

      {championIds.length === 0 && <p className="text-ink-dim text-xs py-1">{emptyLabel}</p>}

      {championIds.length < max && (
        <button
          type="button"
          onClick={() => onPick(championIds.length)}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-hairline p-2.5 text-ink-dim transition-colors hover:border-white/25 hover:text-ink-muted"
        >
          <Plus className="h-4 w-4" />
          <span className="text-xs font-semibold">
            {championIds.length === 0 ? "Add a champion" : `Add backup ${championIds.length + 1}`}
          </span>
        </button>
      )}
    </div>
  );
}
