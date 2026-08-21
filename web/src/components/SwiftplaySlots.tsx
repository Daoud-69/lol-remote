import { useState } from "react";
import { Swords } from "lucide-react";
import { api, championIconUrl, spellIconUrl, type Connection } from "../lib/api";
import type { Champion, LobbyPositions, SummonerSpell } from "../types";
import { ChampionGrid } from "./ChampionGrid";
import { Sheet } from "./ui/Sheet";
import { Card, Muted, SectionTitle } from "./ui/primitives";
import { positionLabel } from "./RolePicker";

/**
 * Swiftplay's pre-picked champions.
 *
 * Unlike every other mode, Swiftplay asks for your champions in the lobby
 * rather than in champ select — so this is the one picker that belongs
 * alongside the role selector instead of on the champ-select screen.
 *
 * The slots come from the client, and so does how many there are: the card
 * renders whatever the lobby reports and disappears entirely in modes that
 * report none, which is how it stays out of the way everywhere else. There is
 * no flag saying "this mode has slots" to check instead.
 */
export function SwiftplaySlots({
  lobby,
  connection,
  champions,
  spells,
  onToast,
}: {
  lobby: LobbyPositions | null;
  connection: Connection;
  champions: Champion[];
  spells: SummonerSpell[];
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const slots = lobby?.slots ?? [];
  if (slots.length === 0) return null;

  const championName = (id: number) => champions.find((c) => c.id === id)?.name ?? "";
  const spellIcon = (id: number) => spells.find((s) => s.id === id)?.iconPath ?? "";

  const choose = async (index: number, championId: number) => {
    setBusy(true);
    try {
      await api.setLobbySlot(connection, index, { championId });
      onToast(`${championName(championId) || "Champion"} set for slot ${index + 1}.`, "ok");
      setEditing(null);
    } catch (error) {
      onToast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle accent="hextech">Your champions</SectionTitle>
      <Muted>Swiftplay picks these in the lobby, before the game starts.</Muted>

      <div className="mt-3 space-y-2">
        {slots.map((slot, index) => (
          <button
            key={index}
            type="button"
            disabled={busy}
            onClick={() => setEditing(index)}
            className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] p-2 text-left transition-colors hover:border-hextech/40 disabled:opacity-50"
          >
            {slot.championId > 0 ? (
              <img
                src={championIconUrl(connection, slot.championId)}
                alt=""
                className="h-11 w-11 shrink-0 rounded-lg bg-obsidian-raised"
              />
            ) : (
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-dashed border-hairline bg-obsidian-raised">
                <Swords className="h-4 w-4 text-ink-dim" />
              </div>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">
                {championName(slot.championId) || "Choose a champion"}
              </span>
              <span className="block text-[11px] text-ink-dim">
                {positionLabel(slot.positionPreference) || "Any role"}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              {[slot.spell1Id, slot.spell2Id].map((spellId, at) =>
                spellIcon(spellId) ? (
                  <img
                    key={at}
                    src={spellIconUrl(connection, spellIcon(spellId))}
                    alt=""
                    className="h-5 w-5 rounded bg-obsidian-raised"
                  />
                ) : null,
              )}
            </span>
          </button>
        ))}
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === null ? "" : `Champion for slot ${editing + 1}`}
      >
        <div className="h-[55svh]">
          <ChampionGrid
            champions={champions}
            connection={connection}
            selectedId={editing === null ? 0 : (slots[editing]?.championId ?? 0)}
            onSelect={(championId) => {
              if (editing !== null) void choose(editing, championId);
            }}
            mode="pick"
          />
        </div>
      </Sheet>
    </Card>
  );
}
