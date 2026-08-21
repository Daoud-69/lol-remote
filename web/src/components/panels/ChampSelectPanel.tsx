import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, ChevronRight, Sword } from "lucide-react";
import { api, championIconUrl, skinSplashUrl, type Connection } from "../../lib/api";
import type {
  AgentState,
  Champion,
  Skin,
  SummonerSpell,
  SwapAction,
  SwapKind,
  TeammateSlot,
  TeamSwap,
} from "../../types";
import { ChampionGrid } from "../ChampionGrid";
import { SkinCarousel } from "../SkinCarousel";
import { SpellPicker } from "../SpellPicker";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Card, SectionTitle, Muted } from "../ui/primitives";

type Tab = "champion" | "spells" | "skin";

/**
 * Long enough that scrolling a finger across the grid does not fire a request
 * per champion it passes, short enough to feel immediate on a deliberate tap.
 */
const HOVER_DELAY_MS = 250;

const SWAP_TOAST: Record<SwapAction, string> = {
  request: "Swap requested.",
  accept: "Swap accepted.",
  decline: "Swap declined.",
  cancel: "Swap withdrawn.",
};

export function ChampSelectPanel({
  state,
  connection,
  champions,
  spells,
  onToast,
}: {
  state: AgentState;
  connection: Connection;
  champions: Champion[];
  spells: SummonerSpell[];
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const select = state.champSelect;
  const [tab, setTab] = useState<Tab>("champion");
  const [hovered, setHovered] = useState(0);
  const [busy, setBusy] = useState(false);
  const [skins, setSkins] = useState<Skin[]>([]);
  const [skinsLoading, setSkinsLoading] = useState(false);
  const [editingSlot, setEditingSlot] = useState<1 | 2>(1);
  const [backgroundSplash, setBackgroundSplash] = useState<string | null>(null);

  const lockedChampionId = select?.selection?.championId ?? 0;
  const serverSkinId = select?.selection?.selectedSkinId ?? 0;

  /**
   * Tapping a skin has to travel to the agent, into the client, and back as a
   * state push before the server would agree — long enough that the highlight
   * appeared stuck and taps felt ignored. Show the choice at once and let the
   * push confirm it.
   */
  const [pendingSkinId, setPendingSkinId] = useState(0);
  const selectedSkinId = pendingSkinId || serverSkinId;

  useEffect(() => {
    if (pendingSkinId && serverSkinId === pendingSkinId) setPendingSkinId(0);
  }, [serverSkinId, pendingSkinId]);

  // A different champion means the old optimistic skin is meaningless.
  useEffect(() => setPendingSkinId(0), [lockedChampionId]);

  useEffect(() => {
    if (!lockedChampionId) {
      setSkins([]);
      return;
    }
    let cancelled = false;
    setSkinsLoading(true);
    api
      .skins(connection, lockedChampionId)
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
  }, [connection, lockedChampionId]);

  const backgroundChampionId = lockedChampionId || hovered || select?.myAction?.championId || 0;

  /** Splash art has no predictable URL — resolve the target skin's real path, whether or not it's locked yet. */
  useEffect(() => {
    if (!backgroundChampionId) {
      setBackgroundSplash(null);
      return;
    }

    // For the champion we are locked into, the skins are already loaded. This
    // used to refetch the whole list on every skin tap, which meant an LCU
    // round trip per tap and a background that visibly reloaded each time.
    if (backgroundChampionId === lockedChampionId) {
      if (skins.length === 0) return;
      const match =
        skins.find((s) => s.id === selectedSkinId) ?? skins.find((s) => s.isBase) ?? skins[0];
      setBackgroundSplash(match?.splashPath ?? null);
      return;
    }

    // Only a champion we are merely hovering needs its own lookup, and the
    // selected skin is irrelevant there — it belongs to a different champion.
    let cancelled = false;
    api
      .skins(connection, backgroundChampionId)
      .then((result) => {
        if (cancelled) return;
        const match = result.find((s) => s.isBase) ?? result[0];
        setBackgroundSplash(match?.splashPath ?? null);
      })
      .catch(() => {
        if (!cancelled) setBackgroundSplash(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, backgroundChampionId, lockedChampionId, skins, selectedSkinId]);

  const hoverTimer = useRef<number | null>(null);
  /** The champion the client was last told about, so a re-tap is not re-sent. */
  const hoverSent = useRef(0);

  // A new action is a fresh slate: the same champion tapped for a ban after a
  // pick is a different request, not a repeat of one already sent.
  const actionId = select?.myAction?.id ?? 0;
  useEffect(() => {
    hoverSent.current = 0;
  }, [actionId]);

  useEffect(() => {
    return () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  /**
   * Tapping a champion moves the local selection and hovers it in the client.
   *
   * Hovering is what tapping *means* — there is no reading of "I tapped this
   * champion" where you did not want the team to see it, which is why this is
   * the behaviour rather than a button next to it. Locking still has its own
   * button, because that one is not reversible.
   *
   * Sent quietly: the champion appearing in the client is its own
   * confirmation, and a toast per tap would bury the screen. A refusal still
   * gets said out loud.
   */
  const chooseChampion = useCallback(
    (championId: number) => {
      setHovered(championId);
      if (!championId) return;

      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => {
        hoverTimer.current = null;
        if (hoverSent.current === championId) return;
        hoverSent.current = championId;
        api.select(connection, championId, false).catch((error: unknown) => {
          // Let the next tap on this champion try again.
          if (hoverSent.current === championId) hoverSent.current = 0;
          onToast((error as Error).message, "error");
        });
      }, HOVER_DELAY_MS);
    },
    [connection, onToast],
  );

  /** Runs a command, reports it, and says whether the client accepted it. */
  const guard = useCallback(
    async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
      setBusy(true);
      try {
        await action();
        onToast(success, "ok");
        return true;
      } catch (error) {
        onToast((error as Error).message, "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onToast],
  );

  if (!select) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Sword className="h-8 w-8 text-ink-dim mb-3" />
        <h3 className="text-ink font-bold mb-1">Not in champion select</h3>
        <Muted>This screen wakes up when a match starts.</Muted>
      </div>
    );
  }

  const action = select.myAction;
  const isMyTurn = Boolean(action?.isInProgress && !action.completed);
  const isBan = action?.type === "ban";
  const seconds = Math.max(0, Math.ceil(select.timeLeftMs / 1000));
  const target = hovered || action?.championId || 0;

  return (
    <div className="relative">
      <SplashBackground connection={connection} splashPath={backgroundSplash} />

      <div className="relative z-10 space-y-4">
        {/* Turn banner */}
        <motion.div
          layout
          className={`rounded-[20px] glass p-[17px] flex items-center justify-between gap-3.5 border transition-colors ${
            isMyTurn ? (isBan ? "border-danger/55" : "border-gold/55") : "border-hairline"
          }`}
        >
          <div className="min-w-0">
            <p className={`font-display font-bold text-lg tracking-[0.06em] uppercase ${isMyTurn ? (isBan ? "text-danger" : "text-gold") : "text-ink"}`}>
              {isMyTurn ? (isBan ? "Your turn to ban" : "Your turn to pick") : phaseLabel(select.phase)}
            </p>
            <p className="text-ink-muted text-[11px] mt-1">{isMyTurn ? "Choose below, then lock in." : "Waiting on other players…"}</p>
          </div>
          <TurnRing seconds={seconds} accent={isMyTurn ? (isBan ? "danger" : "gold") : "dim"} />
        </motion.div>

        {/* Tabs */}
        <div className="glass rounded-[14px] p-1 flex gap-1">
          {(["champion", "spells", "skin"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`relative flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-[11px] transition-colors ${
                tab === value ? "text-gold" : "text-ink-dim hover:text-ink-muted"
              }`}
            >
              {tab === value && (
                <motion.div layoutId="champselect-tab" className="absolute inset-0 bg-white/[0.10] rounded-[11px]" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
              )}
              <span className="relative">{value === "champion" ? "Champion" : value === "spells" ? "Spells" : "Skin"}</span>
            </button>
          ))}
        </div>

        {/* Above the tabs, and outside them: a teammate can ask for a swap at
            any point in the draft, including while you are busy picking or
            sitting on the skin tab, and an expiring request is not something to
            find by navigating to it. */}
        <SwapCard
          select={select}
          connection={connection}
          champions={champions}
          busy={busy}
          onAct={(swap, action) =>
            void guard(
              () => api.swap(connection, swap.kind, swap.id, action),
              SWAP_TOAST[action],
            )
          }
        />

        <AnimatePresence mode="wait">
          {tab === "champion" && (
            <motion.div key="champion" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {isMyTurn ? (
                <div className="space-y-4">
                <Card>
                  {/* Only locking gets a button. Hovering happens on the tap
                      itself, so a second press to confirm what you just chose
                      is a step with nothing behind it. */}
                  <Button
                    variant={isBan ? "danger" : "gold"}
                    size="md"
                    className="mb-1 w-full"
                    icon={isBan ? <Ban className="h-4 w-4" /> : <Sword className="h-4 w-4" />}
                    disabled={!target || busy}
                    onClick={() => void guard(() => api.select(connection, target, true), isBan ? "Ban locked." : "Champion locked in.")}
                  >
                    {isBan ? "Lock ban" : "Lock in"}
                  </Button>
                  <p className="mb-3 text-center text-[11px] text-ink-dim">
                    {isBan ? "Tap a champion to put it on the ban." : "Tap a champion to hover it for the team."}
                  </p>
                  <div className="h-[min(60svh,520px)]">
                    <ChampionGrid champions={champions} connection={connection} selectedId={target} onSelect={chooseChampion} mode={isBan ? "ban" : "pick"} />
                  </div>
                </Card>
                {/* Below the grid rather than above it: on your turn the board
                    is what you are picking against, but the grid is what you
                    came here to tap. */}
                <TeamCard select={select} connection={connection} champions={champions} />
                </div>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <Muted>{lockedChampionId ? "You are locked in. Set your spells and skin while you wait." : "It is not your turn yet. The buttons unlock the moment it is."}</Muted>
                  </Card>
                  <BenchRow select={select} connection={connection} busy={busy} onSwap={(id) => void guard(() => api.benchSwap(connection, id), "Swapped from the bench.")} />
                  <TeamCard select={select} connection={connection} champions={champions} />
                </div>
              )}
            </motion.div>
          )}

          {tab === "spells" && (
            <motion.div key="spells" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <Card>
                <SectionTitle>Summoner spells</SectionTitle>
                <SpellPicker
                  spells={spells}
                  connection={connection}
                  spell1Id={select.selection?.spell1Id ?? 0}
                  spell2Id={select.selection?.spell2Id ?? 0}
                  editingSlot={editingSlot}
                  onEditSlot={setEditingSlot}
                  onChoose={(spellId) => {
                    const current1 = select.selection?.spell1Id ?? 0;
                    const current2 = select.selection?.spell2Id ?? 0;
                    const next1 = editingSlot === 1 ? spellId : current1 === spellId ? current2 : current1;
                    const next2 = editingSlot === 2 ? spellId : current2 === spellId ? current1 : current2;
                    void guard(() => api.setSpells(connection, next1, next2), "Summoner spells updated.");
                  }}
                />
              </Card>
            </motion.div>
          )}

          {tab === "skin" && (
            <motion.div key="skin" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <Card>
                <SectionTitle accent="gold">Skin</SectionTitle>
                {lockedChampionId ? (
                  <SkinCarousel
                    skins={skins}
                    loading={skinsLoading}
                    connection={connection}
                    selectedSkinId={selectedSkinId}
                    onSelect={(skinId) => {
                      const previous = pendingSkinId;
                      setPendingSkinId(skinId);
                      void guard(() => api.setSkin(connection, skinId), "Skin selected.").then(
                        (ok) => {
                          if (!ok) setPendingSkinId(previous);
                        },
                      );
                    }}
                  />
                ) : (
                  <Muted>Lock in a champion first — the client only accepts a skin once your pick is committed.</Muted>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {tab !== "champion" && <TeamCard select={select} connection={connection} champions={champions} />}
      </div>
    </div>
  );
}

const ACCENT_HEX: Record<"gold" | "danger" | "dim", string> = {
  gold: "#c89b3c",
  danger: "#e84057",
  dim: "rgba(255,255,255,0.16)",
};

function TurnRing({ seconds, accent }: { seconds: number; accent: "gold" | "danger" | "dim" }) {
  const urgent = accent !== "dim" && seconds <= 5;
  const pct = Math.max(0, Math.min(1, seconds / 30)) * 360;
  const ringColor = urgent ? ACCENT_HEX.danger : ACCENT_HEX[accent];
  return (
    <div
      className="relative h-[54px] w-[54px] shrink-0 rounded-full transition-[background] duration-700"
      style={{ background: `conic-gradient(${ringColor} ${pct}deg, rgba(255,255,255,0.08) 0deg)` }}
    >
      <div className="absolute inset-[3px] rounded-full bg-obsidian/90 grid place-items-center">
        <span className={`font-display text-xl font-bold tabular-nums ${urgent ? "text-danger" : "text-ink"}`}>{seconds}</span>
      </div>
    </div>
  );
}

function SplashBackground({ connection, splashPath }: { connection: Connection; splashPath: string | null }) {
  return (
    <div className="absolute -top-4 -left-4 -right-4 h-72 -z-0 overflow-hidden rounded-3xl pointer-events-none">
      <AnimatePresence mode="wait">
        {splashPath && (
          <motion.img
            key={splashPath}
            src={skinSplashUrl(connection, splashPath)}
            alt=""
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 0.35, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full w-full object-cover object-top"
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-obsidian/20 via-obsidian/70 to-obsidian" />
    </div>
  );
}

function BenchRow({
  select,
  connection,
  busy,
  onSwap,
}: {
  select: NonNullable<AgentState["champSelect"]>;
  connection: Connection;
  busy: boolean;
  onSwap: (championId: number) => void;
}) {
  if (!select.benchEnabled || select.benchChampionIds.length === 0) return null;
  return (
    <Card>
      <SectionTitle accent="dim">Bench — tap to swap</SectionTitle>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {select.benchChampionIds.map((championId) => (
          <motion.button key={championId} disabled={busy} onClick={() => onSwap(championId)} whileTap={{ scale: 0.92 }} className="shrink-0">
            <img src={championIconUrl(connection, championId)} alt="" className="h-14 w-14 rounded-xl bg-obsidian-raised border border-hairline" />
          </motion.button>
        ))}
      </div>
    </Card>
  );
}

/** The client calls the support role "utility" internally; show the name players actually use. */
function positionLabel(position: string): string {
  return position === "utility" ? "support" : position;
}

/**
 * One team's five slots.
 *
 * A hovered champion is drawn faded and a locked one solid, because the two
 * mean very different things to anyone reading the board — an enemy hovering
 * your counter is still talkable-out-of, a locked one is not.
 */
function TeamRow({
  slots,
  connection,
  label,
}: {
  slots: TeammateSlot[];
  connection: Connection;
  label: (slot: TeammateSlot) => string;
}) {
  return (
    <div className="flex gap-2">
      {slots.map((slot) => {
        const shown = slot.championId || slot.championPickIntent;
        const locked = slot.championId > 0;
        return (
          // Capped, because the cell is square and grows to fill: a mode with a
          // team of one (Practice Tool, a small custom) would otherwise stretch
          // that single slot to the full width and an equal height, burying
          // everything below it.
          <div key={slot.cellId} className="flex-1 max-w-[88px] flex flex-col items-center gap-1">
            {shown > 0 ? (
              <img
                src={championIconUrl(connection, shown)}
                alt=""
                className={`aspect-square w-full rounded-lg bg-obsidian-raised border-2 ${
                  slot.isLocalPlayer ? "border-gold" : "border-transparent"
                } ${locked ? "" : "opacity-55"}`}
              />
            ) : (
              <div className={`aspect-square w-full rounded-lg bg-obsidian-raised border-2 border-dashed ${slot.isLocalPlayer ? "border-gold" : "border-hairline"}`} />
            )}
            <span className="text-[9px] text-ink-dim truncate w-full text-center">{label(slot) || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

function BanRow({ championIds, connection }: { championIds: number[]; connection: Connection }) {
  if (championIds.length === 0) return <p className="text-ink-dim text-xs">None yet.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {championIds.map((championId, index) => (
        <div key={`${championId}-${index}`} className="relative h-9 w-9 rounded-lg overflow-hidden opacity-70">
          <img src={championIconUrl(connection, championId)} alt="" className="h-full w-full bg-obsidian-raised" />
          <Ban className="absolute inset-0 m-auto h-4 w-4 text-danger" />
        </div>
      ))}
    </div>
  );
}

function SideLabel({ children }: { children: string }) {
  return <p className="text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1.5">{children}</p>;
}

const SWAP_LABEL: Record<SwapKind, string> = {
  position: "Role",
  pickOrder: "Pick order",
};

/** Only these three are worth showing; the rest are settled or not offerable. */
function actionableSwaps(swaps: TeamSwap[]): TeamSwap[] {
  return swaps.filter(
    (swap) => swap.state === "RECEIVED" || swap.state === "SENT" || swap.state === "AVAILABLE",
  );
}

/**
 * Role and pick-order trades with your own team.
 *
 * One row per teammate rather than one per swap: a teammate is the thing you
 * think about ("get me off support"), and the kind is a detail you choose
 * after. Listing every kind for every player flattened that into a wall of
 * near-identical chips where the two lines that mattered — who is asking, and
 * who you could ask — were the hardest to find.
 *
 * Incoming requests keep their own block above the list, because they are the
 * only half that expires while you look at it.
 */
function SwapCard({
  select,
  connection,
  champions,
  busy,
  onAct,
}: {
  select: NonNullable<AgentState["champSelect"]>;
  connection: Connection;
  champions: Champion[];
  busy: boolean;
  onAct: (swap: TeamSwap, action: SwapAction) => void;
}) {
  const [asking, setAsking] = useState<number | null>(null);

  const swaps = actionableSwaps(select.swaps);
  const incoming = swaps.filter((swap) => swap.state === "RECEIVED");
  const sent = swaps.filter((swap) => swap.state === "SENT");
  const offerable = swaps.filter((swap) => swap.state === "AVAILABLE");

  const mateOf = (cellId: number) => select.myTeam.find((slot) => slot.cellId === cellId);

  const describe = (cellId: number): string => {
    const mate = mateOf(cellId);
    const championId = mate ? mate.championId || mate.championPickIntent : 0;
    const name = championId ? champions.find((c) => c.id === championId)?.name : "";
    return name || (mate?.assignedPosition ? positionLabel(mate.assignedPosition) : "") || "A teammate";
  };

  const mateIcon = (cellId: number, size = "h-9 w-9") => {
    const mate = mateOf(cellId);
    const championId = mate ? mate.championId || mate.championPickIntent : 0;
    return championId ? (
      <img
        src={championIconUrl(connection, championId)}
        alt=""
        className={`${size} shrink-0 rounded-lg bg-obsidian-raised`}
      />
    ) : (
      <div className={`${size} shrink-0 rounded-lg border border-dashed border-hairline bg-obsidian-raised`} />
    );
  };

  // The people you could ask, each carrying whichever kinds are on offer for
  // them — which is not always both.
  const askable = [...new Set(offerable.map((swap) => swap.cellId))].map((cellId) => ({
    cellId,
    kinds: offerable.filter((swap) => swap.cellId === cellId),
  }));

  if (swaps.length === 0) return null;

  const askingKinds = asking === null ? [] : (askable.find((a) => a.cellId === asking)?.kinds ?? []);

  return (
    <Card>
      <SectionTitle accent={incoming.length > 0 ? "gold" : "dim"}>Swaps</SectionTitle>

      {incoming.map((swap) => (
        <div
          key={`${swap.kind}-${swap.id}`}
          className="mb-3 rounded-xl border border-gold/60 bg-gold/[0.06] p-2.5"
        >
          <div className="flex items-center gap-3">
            {mateIcon(swap.cellId)}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">
                {describe(swap.cellId)} wants to swap
              </span>
              <span className="block text-[11px] text-ink-dim">{SWAP_LABEL[swap.kind]}</span>
            </span>
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button
              variant="ghost"
              size="md"
              className="flex-1"
              disabled={busy}
              onClick={() => onAct(swap, "decline")}
            >
              Decline
            </Button>
            <Button
              variant="gold"
              size="md"
              className="flex-1"
              disabled={busy}
              onClick={() => onAct(swap, "accept")}
            >
              Accept
            </Button>
          </div>
        </div>
      ))}

      {sent.map((swap) => (
        <div
          key={`${swap.kind}-${swap.id}`}
          className="mb-2 flex items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] p-2.5"
        >
          {mateIcon(swap.cellId)}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">Asked {describe(swap.cellId)}</span>
            <span className="block text-[11px] text-ink-dim">
              {SWAP_LABEL[swap.kind]} — waiting for an answer
            </span>
          </span>
          <Button variant="ghost" size="md" disabled={busy} onClick={() => onAct(swap, "cancel")}>
            Cancel
          </Button>
        </div>
      ))}

      {askable.length > 0 && (
        <>
          {(incoming.length > 0 || sent.length > 0) && <div className="my-3 h-px bg-hairline" />}
          <p className="mb-2 text-[11px] text-ink-dim">Tap a teammate to ask for a swap</p>
          <div className="space-y-2">
            {askable.map(({ cellId }) => {
              const mate = mateOf(cellId);
              return (
                <button
                  key={cellId}
                  type="button"
                  disabled={busy}
                  onClick={() => setAsking(cellId)}
                  className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] p-2 text-left transition-colors hover:border-white/25 disabled:opacity-50"
                >
                  {mateIcon(cellId)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {describe(cellId)}
                    </span>
                    <span className="block text-[11px] text-ink-dim">
                      {positionLabel(mate?.assignedPosition ?? "") || "No role"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-dim" />
                </button>
              );
            })}
          </div>
        </>
      )}

      <Sheet
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking === null ? "" : `Swap with ${describe(asking)}`}
      >
        <div className="space-y-2 pb-2">
          {askingKinds.map((swap) => (
            <Button
              key={`${swap.kind}-${swap.id}`}
              variant="ghost"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setAsking(null);
                onAct(swap, "request");
              }}
            >
              {swap.kind === "position" ? "Swap roles" : "Swap pick order"}
            </Button>
          ))}
          {askingKinds.length === 0 && (
            <Muted>Nothing can be swapped with them right now.</Muted>
          )}
        </div>
      </Sheet>
    </Card>
  );
}

function TeamCard({
  select,
  connection,
  champions,
}: {
  select: NonNullable<AgentState["champSelect"]>;
  connection: Connection;
  champions: Champion[];
}) {
  const myBans = select.bans.myTeamBans.filter(Boolean);
  const theirBans = select.bans.theirTeamBans.filter(Boolean);

  /** The enemy board is hidden outright in some modes, so it is drawn only when there is one. */
  const theirTeam = select.theirTeam;

  // Their roles are never revealed, so that line carries the champion's name
  // instead — otherwise it would be five dashes taking up the same space.
  const enemyLabel = (slot: TeammateSlot) => {
    const id = slot.championId || slot.championPickIntent;
    return id ? (champions.find((c) => c.id === id)?.name ?? "") : "";
  };

  return (
    <Card>
      <SectionTitle accent="hextech">Your team</SectionTitle>
      <TeamRow slots={select.myTeam} connection={connection} label={(slot) => positionLabel(slot.assignedPosition)} />

      {theirTeam.length > 0 && (
        <>
          <div className="h-px bg-hairline my-4" />
          <SectionTitle accent="danger">Enemy team</SectionTitle>
          <TeamRow slots={theirTeam} connection={connection} label={enemyLabel} />
        </>
      )}

      <div className="h-px bg-hairline my-4" />

      <SectionTitle accent="dim">Bans</SectionTitle>
      <div className="space-y-3">
        <div>
          <SideLabel>Yours</SideLabel>
          <BanRow championIds={myBans} connection={connection} />
        </div>
        <div>
          <SideLabel>Theirs</SideLabel>
          <BanRow championIds={theirBans} connection={connection} />
        </div>
      </div>
    </Card>
  );
}

function phaseLabel(phase: string): string {
  if (phase === "PLANNING") return "Declaring intent";
  if (phase === "BAN_PICK") return "Ban / pick phase";
  if (phase === "FINALIZATION") return "Finalizing";
  return "Champion select";
}
