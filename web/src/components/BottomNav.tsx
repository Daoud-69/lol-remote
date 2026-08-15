import { motion } from "framer-motion";
import { Activity, Settings2, Swords } from "lucide-react";

export type Tab = "status" | "select" | "auto";

const ITEMS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "status", label: "Status", icon: Activity },
  { id: "select", label: "Champ Select", icon: Swords },
  { id: "auto", label: "Automation", icon: Settings2 },
];

/** Mobile-only bottom tab bar — hidden at the lg breakpoint, where the sidebar layout takes over. */
export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-hairline pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="relative flex-1 flex flex-col items-center gap-1 py-3"
            >
              <Icon className={`h-5 w-5 ${active ? "text-gold" : "text-ink-dim"}`} strokeWidth={active ? 2.4 : 1.8} />
              <span className={`font-display text-[11px] font-bold tracking-[0.08em] ${active ? "text-gold" : "text-ink-dim"}`}>{label}</span>
              {active && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="h-0.5 w-[22px] rounded-full bg-gold shadow-[0_0_12px_#c89b3c]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
