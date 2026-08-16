import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { api, perkIconUrl, type Connection } from "../lib/api";
import type { Perk, PerkStyle, RecommendedRunePage, RuneCatalog, RunePage } from "../types";
import { Button } from "./ui/Button";
import { Muted } from "./ui/primitives";
import { positionLabel } from "./RolePicker";

/**
 * A page is nine perks in a fixed order: keystone, three primary minors, two
 * secondary minors, three stat shards. The editor keeps them as separate bits
 * of state and only flattens on save, because "which slot did that perk come
 * from" is not recoverable from a flat list without re-deriving it every time.
 */
interface Draft {
  primaryStyleId: number;
  keystoneId: number;
  /** One per primary minor slot, in slot order. 0 = not chosen yet. */
  primaryMinors: number[];
  secondaryStyleId: number;
  /** Up to two perks, from two different secondary slots. */
  secondaryPicks: number[];
  /** One per stat slot, in slot order. */
  shards: number[];
}

const EMPTY: Draft = {
  primaryStyleId: 0,
  keystoneId: 0,
  primaryMinors: [0, 0, 0],
  secondaryStyleId: 0,
  secondaryPicks: [],
  shards: [0, 0, 0],
};

const minorSlots = (style: PerkStyle | undefined) =>
  (style?.slots ?? []).filter((slot) => slot.type === "kMixedRegularSplashable");

const statSlots = (style: PerkStyle | undefined) =>
  (style?.slots ?? []).filter((slot) => slot.type === "kStatMod");

const keystoneSlot = (style: PerkStyle | undefined) =>
  (style?.slots ?? []).find((slot) => slot.type === "kKeyStone");

function draftToPage(draft: Draft, styles: PerkStyle[]): RunePage | null {
  const secondary = styles.find((style) => style.id === draft.secondaryStyleId);
  if (!secondary) return null;

  // Secondary perks go in slot order, matching how the client stores them.
  const ordered = minorSlots(secondary)
    .flatMap((slot) => draft.secondaryPicks.filter((id) => slot.perkIds.includes(id)));

  const perkIds = [draft.keystoneId, ...draft.primaryMinors, ...ordered, ...draft.shards];
  if (perkIds.length !== 9 || perkIds.some((id) => !id)) return null;

  return {
    primaryStyleId: draft.primaryStyleId,
    secondaryStyleId: draft.secondaryStyleId,
    selectedPerkIds: perkIds,
  };
}

/** Rebuilds the editor's state from a flat page, by asking each slot what it owns. */
function pageToDraft(page: RunePage, styles: PerkStyle[]): Draft {
  const primary = styles.find((style) => style.id === page.primaryStyleId);
  const secondary = styles.find((style) => style.id === page.secondaryStyleId);
  const ids = page.selectedPerkIds;

  const owns = (slotPerks: number[]) => ids.find((id) => slotPerks.includes(id)) ?? 0;

  return {
    primaryStyleId: page.primaryStyleId,
    secondaryStyleId: page.secondaryStyleId,
    keystoneId: owns(keystoneSlot(primary)?.perkIds ?? []),
    primaryMinors: minorSlots(primary).map((slot) => owns(slot.perkIds)),
    secondaryPicks: minorSlots(secondary)
      .map((slot) => owns(slot.perkIds))
      .filter(Boolean),
    // Stat slots share perk ids across slots (Adaptive Force appears twice), so
    // they have to be read positionally rather than by lookup.
    shards: ids.slice(6, 9),
  };
}

export function RuneEditor({
  championId,
  championName,
  position,
  connection,
  initial,
  onSave,
  onClear,
  onToast,
}: {
  championId: number;
  championName: string;
  position: string;
  connection: Connection;
  initial: RunePage | undefined;
  onSave: (page: RunePage) => void;
  onClear: () => void;
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const [catalog, setCatalog] = useState<RuneCatalog | null>(null);
  const [recommended, setRecommended] = useState<RecommendedRunePage[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [nextCatalog, nextRecommended] = await Promise.all([
          api.runeCatalog(connection),
          // Recommendations are a nicety — a failure here should not stop the
          // editor from opening.
          api.recommendedRunes(connection, championId, position).catch(() => []),
        ]);
        if (cancelled) return;
        setCatalog(nextCatalog);
        setRecommended(nextRecommended);
        setDraft(
          initial
            ? pageToDraft(initial, nextCatalog.styles)
            : { ...EMPTY, primaryStyleId: nextCatalog.styles[0]?.id ?? 0 },
        );
      } catch (error) {
        if (!cancelled) onToast((error as Error).message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Reloading on every keystroke of the draft would defeat the point; this is
    // deliberately keyed to the champion being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [championId, position]);

  const styles = catalog?.styles ?? [];
  const perkById = useMemo(() => {
    const map = new Map<number, Perk>();
    for (const perk of catalog?.perks ?? []) map.set(perk.id, perk);
    return map;
  }, [catalog]);

  const primary = styles.find((style) => style.id === draft.primaryStyleId);
  const secondary = styles.find((style) => style.id === draft.secondaryStyleId);
  const page = draftToPage(draft, styles);

  const choosePrimary = (styleId: number) => {
    // Every perk below belongs to the old tree, so none of it survives.
    setDraft((current) => ({
      ...current,
      primaryStyleId: styleId,
      keystoneId: 0,
      primaryMinors: [0, 0, 0],
      secondaryStyleId: current.secondaryStyleId === styleId ? 0 : current.secondaryStyleId,
      secondaryPicks: current.secondaryStyleId === styleId ? [] : current.secondaryPicks,
    }));
  };

  const chooseSecondary = (styleId: number) =>
    setDraft((current) => ({ ...current, secondaryStyleId: styleId, secondaryPicks: [] }));

  /** At most one perk per secondary slot, at most two overall, oldest evicted. */
  const toggleSecondary = (perkId: number, slotPerks: number[]) => {
    setDraft((current) => {
      const withoutSlot = current.secondaryPicks.filter((id) => !slotPerks.includes(id));
      if (current.secondaryPicks.includes(perkId)) {
        return { ...current, secondaryPicks: withoutSlot };
      }
      const next = [...withoutSlot, perkId];
      return { ...current, secondaryPicks: next.slice(-2) };
    });
  };

  const loadRecommendation = (recommendation: RecommendedRunePage) => {
    setDraft(pageToDraft(recommendation, styles));
    onToast("Loaded League's recommendation — tweak it or save as is.", "ok");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-hextech" />
      </div>
    );
  }

  if (!catalog) {
    return <Muted>Could not load the rune catalog from the League client.</Muted>;
  }

  return (
    <div className="space-y-5">
      {recommended.length > 0 && (
        <section>
          <Label>
            <Sparkles className="mr-1 inline h-3 w-3" />
            League's recommendations
            {position && ` · ${positionLabel(position)}`}
          </Label>
          <div className="flex flex-wrap gap-2">
            {recommended.map((recommendation) => (
              <button
                key={recommendation.recommendationId}
                type="button"
                onClick={() => loadRecommendation(recommendation)}
                className="flex items-center gap-2 rounded-xl border border-hairline bg-white/[0.03] p-2 pr-3 transition-colors hover:border-hextech/50"
              >
                <img
                  src={perkIconUrl(connection, recommendation.keystoneIconPath)}
                  alt=""
                  className="h-8 w-8"
                />
                <span className="text-xs font-semibold text-ink">
                  {recommendation.keystoneName}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <Label>Primary tree</Label>
        <StyleRow
          styles={styles}
          connection={connection}
          selectedId={draft.primaryStyleId}
          onSelect={choosePrimary}
        />

        {primary && (
          <div className="mt-4 space-y-4">
            <PerkRow
              title="Keystone"
              perkIds={keystoneSlot(primary)?.perkIds ?? []}
              perkById={perkById}
              connection={connection}
              isSelected={(id) => draft.keystoneId === id}
              onSelect={(id) => setDraft((current) => ({ ...current, keystoneId: id }))}
              big
            />
            {minorSlots(primary).map((slot, index) => (
              <PerkRow
                key={index}
                title={`Row ${index + 1}`}
                perkIds={slot.perkIds}
                perkById={perkById}
                connection={connection}
                isSelected={(id) => draft.primaryMinors[index] === id}
                onSelect={(id) =>
                  setDraft((current) => {
                    const primaryMinors = [...current.primaryMinors];
                    primaryMinors[index] = id;
                    return { ...current, primaryMinors };
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <Label>Secondary tree</Label>
        <StyleRow
          styles={styles.filter((style) => primary?.allowedSubStyles.includes(style.id))}
          connection={connection}
          selectedId={draft.secondaryStyleId}
          onSelect={chooseSecondary}
        />

        {secondary && (
          <div className="mt-4 space-y-4">
            <p className="text-ink-dim text-[11px]">
              Pick two, from two different rows ({draft.secondaryPicks.length}/2).
            </p>
            {minorSlots(secondary).map((slot, index) => (
              <PerkRow
                key={index}
                title={`Row ${index + 1}`}
                perkIds={slot.perkIds}
                perkById={perkById}
                connection={connection}
                isSelected={(id) => draft.secondaryPicks.includes(id)}
                onSelect={(id) => toggleSecondary(id, slot.perkIds)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <Label>Stat shards</Label>
        <div className="space-y-4">
          {statSlots(styles.find((style) => style.id === 8400)).map((slot, index) => (
            <PerkRow
              key={index}
              title={["Offense", "Flex", "Defense"][index] ?? `Shard ${index + 1}`}
              perkIds={slot.perkIds}
              perkById={perkById}
              connection={connection}
              isSelected={(id) => draft.shards[index] === id}
              onSelect={(id) =>
                setDraft((current) => {
                  const shards = [...current.shards];
                  shards[index] = id;
                  return { ...current, shards };
                })
              }
              small
            />
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={() => page && onSave(page)}
          disabled={!page}
          variant="hextech"
          className="flex-1"
        >
          {page ? `Save for ${championName}` : "Fill every slot to save"}
        </Button>
        {initial && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Delete this rune page"
            className="rounded-xl border border-hairline p-3 text-ink-dim transition-colors hover:border-danger/50 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.22em] text-ink-dim">
      {children}
    </p>
  );
}

function StyleRow({
  styles,
  connection,
  selectedId,
  onSelect,
}: {
  styles: PerkStyle[];
  connection: Connection;
  selectedId: number;
  onSelect: (styleId: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {styles.map((style) => (
        <button
          key={style.id}
          type="button"
          onClick={() => onSelect(style.id)}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${
            selectedId === style.id
              ? "border-gold bg-gold/10 text-gold"
              : "border-hairline bg-white/[0.03] text-ink-muted"
          }`}
        >
          <img src={perkIconUrl(connection, style.iconPath)} alt="" className="h-4 w-4" />
          <span className="text-xs font-semibold">{style.name}</span>
        </button>
      ))}
    </div>
  );
}

function PerkRow({
  title,
  perkIds,
  perkById,
  connection,
  isSelected,
  onSelect,
  big = false,
  small = false,
}: {
  title: string;
  perkIds: number[];
  perkById: Map<number, Perk>;
  connection: Connection;
  isSelected: (perkId: number) => boolean;
  onSelect: (perkId: number) => void;
  big?: boolean;
  small?: boolean;
}) {
  const size = big ? "h-12 w-12" : small ? "h-7 w-7" : "h-9 w-9";

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-ink-dim">{title}</p>
      <div className="flex flex-wrap gap-2">
        {perkIds.map((perkId, index) => {
          const perk = perkById.get(perkId);
          const selected = isSelected(perkId);
          return (
            <button
              // Stat rows repeat perk ids across slots, so the id alone is not unique.
              key={`${perkId}-${index}`}
              type="button"
              onClick={() => onSelect(perkId)}
              title={perk?.name}
              aria-label={perk?.name ?? String(perkId)}
              aria-pressed={selected}
              className={`rounded-full border-2 p-0.5 transition-all ${
                selected
                  ? "border-gold bg-gold/10"
                  : "border-transparent opacity-55 hover:opacity-100"
              }`}
            >
              <img
                src={perk ? perkIconUrl(connection, perk.iconPath) : undefined}
                alt=""
                className={`${size} rounded-full`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
