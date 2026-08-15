import { motion } from "framer-motion";
import { spellIconUrl, type Connection } from "../lib/api";
import type { SummonerSpell } from "../types";

/** Two-slot picker. Tapping a spell fills the slot being edited; the in-use spell swaps if reused elsewhere. */
export function SpellPicker({
  spells,
  connection,
  spell1Id,
  spell2Id,
  editingSlot,
  onEditSlot,
  onChoose,
}: {
  spells: SummonerSpell[];
  connection: Connection;
  spell1Id: number;
  spell2Id: number;
  editingSlot: 1 | 2;
  onEditSlot: (slot: 1 | 2) => void;
  onChoose: (spellId: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        {([1, 2] as const).map((slot) => {
          const id = slot === 1 ? spell1Id : spell2Id;
          const iconPath = spells.find((s) => s.id === id)?.iconPath;
          const active = editingSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onEditSlot(slot)}
              className={`rounded-xl border-2 p-0.5 transition-colors ${active ? "border-gold" : "border-hairline"}`}
            >
              {id > 0 && iconPath ? (
                <img src={spellIconUrl(connection, iconPath)} alt="" className="h-12 w-12 rounded-lg bg-obsidian-raised" />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-obsidian-raised flex items-center justify-center text-ink-dim text-xs font-bold">
                  D{slot}
                </div>
              )}
            </button>
          );
        })}
        <p className="text-[11px] text-ink-dim flex-1">Tap a slot, then choose below. Picking the spell already in the other slot swaps them.</p>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
        {spells.map((spell) => {
          const inUse = spell.id === spell1Id || spell.id === spell2Id;
          return (
            <motion.button
              key={spell.id}
              type="button"
              onClick={() => onChoose(spell.id)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              className={`flex flex-col items-center gap-1 ${inUse ? "opacity-40" : ""}`}
              title={spell.name}
            >
              <img src={spellIconUrl(connection, spell.iconPath)} alt={spell.name} className="h-9 w-9 rounded-lg bg-obsidian-raised" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
