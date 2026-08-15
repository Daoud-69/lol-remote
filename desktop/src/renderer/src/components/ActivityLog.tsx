import { AnimatePresence, motion } from "framer-motion";
import { Card, SectionTitle } from "./primitives";
import type { AgentState } from "../../../../../agent/src/types";

export function ActivityLog({ log }: { log: AgentState["log"] }) {
  return (
    <Card className="flex-1 min-h-0 flex flex-col">
      <SectionTitle accent="hextech">Activity</SectionTitle>
      {log.length === 0 ? (
        <p className="text-ink-dim text-sm">Nothing yet.</p>
      ) : (
        <div className="space-y-2.5 overflow-y-auto no-scrollbar flex-1 min-h-0">
          <AnimatePresence initial={false}>
            {log.slice(0, 30).map((entry) => (
              <motion.div
                key={`${entry.at}-${entry.message}`}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 text-xs"
              >
                <span className="text-ink-dim tabular-nums shrink-0">
                  {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-ink-muted leading-relaxed">{entry.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}
