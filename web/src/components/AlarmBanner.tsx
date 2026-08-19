import { AnimatePresence, motion } from "framer-motion";
import { BellRing, VolumeX } from "lucide-react";
import type { AlertKind } from "../hooks/useAgent";

const LABELS: Record<AlertKind, string> = {
  "ready-check": "Match found",
  "game-start": "Game starting",
  "pick-turn": "Your turn to pick",
  "ban-turn": "Your turn to ban",
};

/**
 * Sits above everything while an alarm sounds, for one reason: to be the
 * obvious way to stop the noise. Anything subtler leaves someone stabbing at
 * the screen looking for the off switch.
 */
export function AlarmBanner({ kind, onSilence }: { kind: AlertKind | null; onSilence: () => void }) {
  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          initial={{ y: -70, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -70, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed inset-x-0 top-0 z-[60] px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        >
          <div className="glass mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-gold/60 px-4 py-3 shadow-[0_18px_50px_-20px_rgba(200,155,60,0.9)]">
            <motion.span
              animate={{ scale: [1, 1.18, 1] }}
              transition={{ repeat: Infinity, duration: 0.9 }}
              className="text-gold"
            >
              <BellRing className="h-5 w-5" />
            </motion.span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-sm font-bold uppercase tracking-wider text-gold">
                {LABELS[kind]}
              </span>
              <span className="block text-[11px] text-ink-muted">Alarm sounding</span>
            </span>
            <button
              type="button"
              onClick={onSilence}
              className="flex items-center gap-1.5 rounded-xl border border-hairline bg-white/[0.06] px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:border-white/30"
            >
              <VolumeX className="h-4 w-4" />
              Stop
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
