import { motion } from "framer-motion";
import type { ReactNode } from "react";

type Variant = "gold" | "hextech" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

const variantClasses: Record<Variant, string> = {
  gold: "font-display bg-gradient-to-br from-[#f0d089] to-[#c89b3c] text-obsidian tracking-[0.2em] shadow-[0_16px_40px_-20px_rgba(200,155,60,0.9)] border border-white/25",
  hextech:
    "font-display bg-gradient-to-br from-[#3fe3d4] to-[#0ac8b9] text-obsidian tracking-[0.2em] shadow-[0_16px_40px_-18px_rgba(10,200,185,0.9)] border border-white/20",
  ghost: "text-xs tracking-[0.12em] bg-white/[0.04] text-ink-muted border border-hairline hover:text-ink hover:border-white/20",
  danger: "font-display bg-gradient-to-br from-[#ff7183] to-[#e84057] text-obsidian tracking-[0.2em] shadow-[0_16px_40px_-20px_rgba(232,64,87,0.9)] border border-white/20",
};

const sizeClasses: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-6 py-3.5 text-base rounded-2xl",
  xl: "px-8 py-5 text-lg rounded-3xl",
};

export function Button({
  children,
  onClick,
  variant = "ghost",
  size = "md",
  disabled,
  className = "",
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`inline-flex items-center justify-center gap-2 font-bold uppercase transition-colors disabled:opacity-35 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {icon}
      {children}
    </motion.button>
  );
}
