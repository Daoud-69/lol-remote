import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-[20px] p-[18px] ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, accent = "gold" }: { children: ReactNode; accent?: "hextech" | "gold" | "danger" | "dim" }) {
  const color = accent === "hextech" ? "text-hextech" : accent === "danger" ? "text-danger" : accent === "dim" ? "text-ink-dim" : "text-gold";
  return (
    <h3 className={`font-display text-[11px] font-bold uppercase tracking-[0.26em] mb-3.5 ${color}`}>{children}</h3>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-ink-dim text-sm">{children}</p>;
}

export function StatusDot({ color, pulse = false }: { color: "hextech" | "gold" | "danger" | "success" | "dim"; pulse?: boolean }) {
  const colorClass = {
    hextech: "bg-hextech shadow-[0_0_10px_rgba(10,200,185,0.8)]",
    gold: "bg-gold shadow-[0_0_10px_rgba(200,155,60,0.8)]",
    danger: "bg-danger shadow-[0_0_10px_rgba(232,64,87,0.8)]",
    success: "bg-success shadow-[0_0_10px_rgba(34,197,94,0.8)]",
    dim: "bg-ink-dim",
  }[color];
  return <span className={`inline-block h-2 w-2 rounded-full ${colorClass} ${pulse ? "animate-pulse-glow" : ""}`} />;
}

export function Badge({ children, tone = "dim" }: { children: ReactNode; tone?: "gold" | "hextech" | "dim" | "danger" }) {
  const toneClass = {
    gold: "bg-gold/15 text-gold border-gold/30",
    hextech: "bg-hextech/15 text-hextech border-hextech/30",
    dim: "bg-white/5 text-ink-dim border-hairline",
    danger: "bg-danger/15 text-danger border-danger/30",
  }[tone];
  return (
    <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${toneClass}`}>
      {children}
    </span>
  );
}

export function FadeSlide({ children, keyId, className = "" }: { children: ReactNode; keyId: string; className?: string }) {
  return (
    <motion.div
      key={keyId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-[27px] w-[46px] shrink-0 items-center rounded-full transition-all border ${
        value
          ? "bg-gradient-to-r from-hextech/85 to-hextech/45 border-hextech/70 shadow-[0_0_20px_-4px_rgba(10,200,185,0.8)]"
          : "bg-white/[0.06] border-hairline"
      }`}
      aria-pressed={value}
      aria-label={label}
    >
      <motion.span
        className="inline-block h-[21px] w-[21px] rounded-full bg-ink shadow"
        animate={{ x: value ? 19 : 3 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
