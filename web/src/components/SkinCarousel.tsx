import { Loader2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { skinSplashUrl, type Connection } from "../lib/api";
import type { Skin } from "../types";

/** Horizontal, native-scroll-snap carousel — locked skins stay visible but unselectable. */
export function SkinCarousel({
  skins,
  loading,
  connection,
  selectedSkinId,
  onSelect,
}: {
  skins: Skin[];
  loading: boolean;
  connection: Connection;
  selectedSkinId: number;
  onSelect: (skinId: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 text-gold animate-spin" />
      </div>
    );
  }

  if (skins.length === 0) {
    return <p className="text-ink-dim text-sm py-4">No skins to show yet.</p>;
  }

  const owned = skins.filter((s) => s.unlocked || s.isBase);
  const locked = skins.filter((s) => !s.unlocked && !s.isBase);
  const ordered = [...owned, ...locked];

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1 -mx-1 px-1">
      {ordered.map((skin) => {
        const selectable = skin.unlocked || skin.isBase;
        const selected = skin.id === selectedSkinId;
        return (
          <motion.button
            key={skin.id}
            type="button"
            disabled={!selectable}
            onClick={() => onSelect(skin.id)}
            whileHover={selectable ? { scale: 1.03 } : undefined}
            whileTap={selectable ? { scale: 0.97 } : undefined}
            className="relative shrink-0 w-40 sm:w-44 snap-start text-left"
          >
            <div
              className={`relative aspect-video rounded-xl overflow-hidden border-2 bg-obsidian-raised ${
                selected ? "border-gold shadow-[0_0_20px_rgba(200,155,60,0.45)]" : "border-hairline"
              }`}
            >
              <img
                src={skinSplashUrl(connection, skin.splashPath)}
                alt={skin.name}
                loading="lazy"
                className={`h-full w-full object-cover object-top ${!selectable ? "opacity-35 grayscale" : ""}`}
              />
              {!selectable && (
                <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-muted">
                  <Lock className="h-2.5 w-2.5" /> Locked
                </span>
              )}
              {selected && <div className="absolute inset-0 ring-2 ring-inset ring-gold/60" />}
            </div>
            <p className={`mt-1.5 text-xs truncate ${selected ? "text-gold font-semibold" : "text-ink-muted"}`}>
              {skin.isBase ? "Default" : skin.name}
            </p>
          </motion.button>
        );
      })}
    </div>
  );
}
