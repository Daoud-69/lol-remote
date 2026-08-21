import { useEffect, useState } from "react";
import { Swords } from "lucide-react";
import { api, championIconUrl, spellIconUrl, type Connection } from "../lib/api";
import type { Champion, LobbySlot, RunePage, Skin, SummonerSpell } from "../types";
import { POSITIONS } from "../types";
import { ChampionGrid } from "./ChampionGrid";
import { RuneEditor } from "./RuneEditor";
import { SkinCarousel } from "./SkinCarousel";
import { SpellPicker } from "./SpellPicker";
import { Sheet } from "./ui/Sheet";
import { Muted } from "./ui/primitives";
import { positionLabel } from "./RolePicker";

type SlotTab = "champion" | "skin" | "runes" | "spells";

const TABS: { id: SlotTab; label: string }[] = [
  { id: "champion", label: "Champion" },
  { id: "skin", label: "Skin" },
  { id: "runes", label: "Runes" },
  { id: "spells", label: "Spells" },
];

/**
 * Swiftplay's pre-picked champions.
 *
 * Unlike every other mode, Swiftplay asks in the lobby rather than in champ
 * select, and it asks for a whole loadout per slot — champion, the role you
 * want to play it in, both spells, a skin and a rune page. That is why this is
 * an editor with tabs rather than a champion picker: picking the champion and
 * leaving the other four to the PC would only half-move the job to the phone.
 *
 * It opens from the mode picker, off the back of choosing Swiftplay, because
 * that is when the question is actually being asked — the client will not queue
 * without an answer, and a settings screen you have to know to visit is the
 * wrong place for something the mode demands before it will start.
 *
 * How many slots there are comes from the client. Whether a mode has them at
 * all is answered by the list being empty, since the client advertises no flag
 * for it the way it does `showPositionSelector` for roles.
 */
export function SwiftplayLoadout({
  open,
  onClose,
  slots,
  connection,
  champions,
  spells,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  slots: LobbySlot[];
  connection: Connection;
  champions: Champion[];
  spells: SummonerSpell[];
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [tab, setTab] = useState<SlotTab>("champion");
  const [busy, setBusy] = useState(false);
  const [skins, setSkins] = useState<Skin[]>([]);
  const [skinsLoading, setSkinsLoading] = useState(false);
  const [editingSpell, setEditingSpell] = useState<1 | 2>(1);

  const slot: LobbySlot | undefined = editing === null ? undefined : slots[editing];
  const editingChampionId = slot?.championId ?? 0;

  // Skins are per champion, so the carousel's list follows whichever slot is
  // open rather than being fetched once.
  useEffect(() => {
    if (!editingChampionId) {
      setSkins([]);
      return;
    }
    let cancelled = false;
    setSkinsLoading(true);
    api
      .skins(connection, editingChampionId)
      .then((result) => {
        if (!cancelled) setSkins(result);
      })
      .catch(() => {
        if (!cancelled) setSkins([]);
      })
      .finally(() => {
        if (!cancelled) setSkinsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, editingChampionId]);

  const championName = (id: number) => champions.find((c) => c.id === id)?.name ?? "";
  const spellIcon = (id: number) => spells.find((s) => s.id === id)?.iconPath ?? "";

  const patch = async (
    index: number,
    body: Parameters<typeof api.setLobbySlot>[2],
    success: string,
  ) => {
    setBusy(true);
    try {
      await api.setLobbySlot(connection, index, body);
      onToast(success, "ok");
    } catch (error) {
      onToast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const editingName = championName(editingChampionId);

  return (
    <Sheet
      open={open}
      title={
        editing === null
          ? "Choose your champions"
          : `Slot ${editing + 1}${editingName ? ` — ${editingName}` : ""}`
      }
      onClose={() => {
        // Backing out of a slot returns to the list rather than closing the
        // whole thing — the list is the only way through to the other slot.
        if (editing !== null) setEditing(null);
        else onClose();
      }}
    >
      {editing === null ? (
        <div className="space-y-2">
          <Muted>Swiftplay picks these before the game starts. Tap one to set it up.</Muted>
          {slots.map((entry, index) => (
          <button
            key={index}
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(index);
              setTab("champion");
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] p-2 text-left transition-colors hover:border-hextech/40 disabled:opacity-50"
          >
            {entry.championId > 0 ? (
              <img
                src={championIconUrl(connection, entry.championId)}
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
                {championName(entry.championId) || "Choose a champion"}
              </span>
              <span className="block text-[11px] text-ink-dim">
                {positionLabel(entry.positionPreference) || "Any role"}
                {entry.perks ? " · runes set" : ""}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              {[entry.spell1Id, entry.spell2Id].map((spellId, at) =>
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
      ) : (
        slot && (
          <div className="space-y-3">
            <div className="glass flex gap-1 rounded-[14px] p-1">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={`flex-1 rounded-[11px] py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    tab === entry.id ? "bg-white/[0.10] text-hextech" : "text-ink-dim"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {tab === "champion" && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {POSITIONS.map((position) => (
                    <button
                      key={position}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void patch(
                          editing,
                          { positionPreference: position },
                          `Slot ${editing + 1} set to ${positionLabel(position)}.`,
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                        slot.positionPreference.toUpperCase() === position
                          ? "border-hextech bg-hextech/10 text-hextech"
                          : "border-hairline bg-white/[0.03] text-ink-muted"
                      }`}
                    >
                      {positionLabel(position)}
                    </button>
                  ))}
                </div>
                <div className="h-[45svh]">
                  <ChampionGrid
                    champions={champions}
                    connection={connection}
                    selectedId={slot.championId}
                    onSelect={(championId) =>
                      void patch(
                        editing,
                        { championId },
                        `${championName(championId) || "Champion"} set for slot ${editing + 1}.`,
                      )
                    }
                    mode="pick"
                  />
                </div>
              </>
            )}

            {tab === "skin" && (
              <SkinCarousel
                skins={skins}
                loading={skinsLoading}
                connection={connection}
                selectedSkinId={slot.skinId}
                onSelect={(skinId) => void patch(editing, { skinId }, "Skin set.")}
              />
            )}

            {tab === "runes" && (
              <RuneEditor
                championId={slot.championId}
                championName={championName(slot.championId) || `Slot ${editing + 1}`}
                position={slot.positionPreference}
                connection={connection}
                initial={slot.perks ?? undefined}
                onSave={(page: RunePage) => void patch(editing, { perks: page }, "Runes set.")}
                // A slot always has a page — the client will not queue without
                // one — so there is nothing to clear it to.
                onClear={() => onToast("A Swiftplay slot always needs runes.", "error")}
                onToast={onToast}
              />
            )}

            {tab === "spells" && (
              <SpellPicker
                spells={spells}
                connection={connection}
                spell1Id={slot.spell1Id}
                spell2Id={slot.spell2Id}
                editingSlot={editingSpell}
                onEditSlot={setEditingSpell}
                onChoose={(spellId) => {
                  // Same swap rule the champ-select picker uses: choosing the
                  // spell already in the other slot trades them rather than
                  // leaving you with it twice, which the client refuses.
                  const next1 =
                    editingSpell === 1 ? spellId : slot.spell1Id === spellId ? slot.spell2Id : slot.spell1Id;
                  const next2 =
                    editingSpell === 2 ? spellId : slot.spell2Id === spellId ? slot.spell1Id : slot.spell2Id;
                  void patch(editing, { spell1Id: next1, spell2Id: next2 }, "Spells set.");
                }}
              />
            )}
          </div>
        )
      )}
    </Sheet>
  );
}
