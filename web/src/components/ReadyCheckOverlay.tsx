import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";

export function ReadyCheckOverlay({
  visible,
  secondsLeft,
  busy,
  onAccept,
  onDecline,
}: {
  visible: boolean;
  secondsLeft: number;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-end sm:justify-center bg-obsidian/95 backdrop-blur-xl px-6 pb-10 pt-16 sm:pb-16"
        >
          {/* Ambient pulse glow field */}
          <motion.div
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 -z-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(50% 40% at 50% 35%, rgba(200,155,60,0.25), transparent 70%)",
            }}
          />

          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="relative z-10 flex flex-col items-center text-center mb-auto sm:mb-0 mt-auto sm:mt-0"
          >
            <div className="relative h-[132px] w-[132px] grid place-items-center mb-6">
              <span className="absolute inset-0 rounded-full border border-gold/70 animate-ring" />
              <span className="absolute inset-0 rounded-full border border-hextech/55 animate-ring" style={{ animationDelay: "0.7s" }} />
              <span className="absolute inset-0 rounded-full border border-gold/35 animate-ring" style={{ animationDelay: "1.4s" }} />
              <div
                className="relative h-24 w-24 rounded-full grid place-items-center border border-white/20 animate-breathe"
                style={{ background: "linear-gradient(150deg, rgba(200,155,60,0.28), rgba(10,200,185,0.18))" }}
              >
                <span className="font-display text-[44px] font-bold tabular-nums text-ink text-glow-gold">{secondsLeft}</span>
              </div>
            </div>

            <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-[0.2em] sm:tracking-[0.3em] text-ink text-glow-gold uppercase leading-none">
              Match<br className="sm:hidden" /> Found
            </h1>
            <p className="text-xs tracking-[0.14em] text-ink-muted uppercase mt-4">Ranked Solo · {secondsLeft}s to respond</p>
          </motion.div>

          <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-3 mt-10 sm:mt-14">
            <motion.button
              type="button"
              disabled={busy}
              onClick={onAccept}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="w-full flex items-center justify-center gap-2 rounded-[22px] bg-gradient-to-br from-[#f0d089] to-[#c89b3c] border border-white/25 py-6 font-display text-2xl sm:text-3xl font-bold uppercase tracking-[0.24em] text-obsidian animate-breathe disabled:opacity-50"
            >
              <Check className="h-6 w-6" strokeWidth={3} />
              Accept
            </motion.button>
            <motion.button
              type="button"
              disabled={busy}
              onClick={onDecline}
              whileTap={{ scale: 0.97 }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-hairline bg-transparent px-8 py-3.5 text-sm font-semibold text-ink-muted uppercase tracking-wider transition-colors hover:text-danger hover:border-danger/50 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Decline
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
