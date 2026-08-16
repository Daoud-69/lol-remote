import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Sword } from "lucide-react";
import { api, championIconUrl, skinSplashUrl, type Connection } from "../../lib/api";
import type { AgentState, Champion, Skin, SummonerSpell } from "../../types";
import { ChampionGrid } from "../ChampionGrid";
import { SkinCarousel } from "../SkinCarousel";
import { SpellPicker } from "../SpellPicker";
import { Button } from "../ui/Button";
import { Card, SectionTitle, Muted } from "../ui/primitives";

type Tab = "champion" | "spells" | "skin";

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
  const selectedSkinId = select?.selection?.selectedSkinId ?? 0;

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
    let cancelled = false;
    api
      .skins(connection, backgroundChampionId)
      .then((result) => {
        if (cancelled) return;
        const match = result.find((s) => s.id === selectedSkinId) ?? result.find((s) => s.isBase) ?? result[0];
        setBackgroundSplash(match?.splashPath ?? null);
      })
      .catch(() => {
        if (!cancelled) setBackgroundSplash(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, backgroundChampionId, selectedSkinId]);

  const guard = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      setBusy(true);
      try {
        await action();
        onToast(success, "ok");
      } catch (error) {
        onToast((error as Error).message, "error");
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

        <AnimatePresence mode="wait">
          {tab === "champion" && (
            <motion.div key="champion" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {isMyTurn ? (
                <Card>
                  <div className="flex gap-2 mb-3">
                    <Button
                      variant="ghost"
                      size="md"
                      className="flex-1"
                      disabled={!target || busy}
                      onClick={() => void guard(() => api.select(connection, target, false), isBan ? "Ban hovered." : "Champion hovered.")}
                    >
                      {isBan ? "Hover ban" : "Hover"}
                    </Button>
                    <Button
                      variant={isBan ? "danger" : "gold"}
                      size="md"
                      className="flex-1"
                      icon={isBan ? <Ban className="h-4 w-4" /> : <Sword className="h-4 w-4" />}
                      disabled={!target || busy}
                      onClick={() => void guard(() => api.select(connection, target, true), isBan ? "Ban locked." : "Champion locked in.")}
                    >
                      {isBan ? "Lock ban" : "Lock in"}
                    </Button>
                  </div>
                  <div className="h-[min(60svh,520px)]">
                    <ChampionGrid champions={champions} connection={connection} selectedId={target} onSelect={setHovered} mode={isBan ? "ban" : "pick"} />
                  </div>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <Muted>{lockedChampionId ? "You are locked in. Set your spells and skin while you wait." : "It is not your turn yet. The buttons unlock the moment it is."}</Muted>
                  </Card>
                  <BenchRow select={select} connection={connection} busy={busy} onSwap={(id) => void guard(() => api.benchSwap(connection, id), "Swapped from the bench.")} />
                  <TeamCard select={select} connection={connection} />
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
                    onSelect={(skinId) => void guard(() => api.setSkin(connection, skinId), "Skin selected.")}
                  />
                ) : (
                  <Muted>Lock in a champion first — the client only accepts a skin once your pick is committed.</Muted>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {tab !== "champion" && <TeamCard select={select} connection={connection} />}
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

function TeamCard({ select, connection }: { select: NonNullable<AgentState["champSelect"]>; connection: Connection }) {
  const bans = [...select.bans.myTeamBans, ...select.bans.theirTeamBans].filter(Boolean);

  return (
    <Card>
      <SectionTitle accent="dim">Your team</SectionTitle>
      <div className="flex gap-2">
        {select.myTeam.map((slot) => {
          const shown = slot.championId || slot.championPickIntent;
          return (
            <div key={slot.cellId} className="flex-1 flex flex-col items-center gap-1">
              {shown > 0 ? (
                <img
                  src={championIconUrl(connection, shown)}
                  alt=""
                  className={`aspect-square w-full rounded-lg bg-obsidian-raised border-2 ${slot.isLocalPlayer ? "border-gold" : "border-transparent"}`}
                />
              ) : (
                <div className={`aspect-square w-full rounded-lg bg-obsidian-raised border-2 border-dashed ${slot.isLocalPlayer ? "border-gold" : "border-hairline"}`} />
              )}
              <span className="text-[9px] text-ink-dim truncate w-full text-center">{positionLabel(slot.assignedPosition) || "—"}</span>
            </div>
          );
        })}
      </div>

      <div className="h-px bg-hairline my-4" />

      <SectionTitle accent="dim">Bans</SectionTitle>
      {bans.length === 0 ? (
        <p className="text-ink-muted text-sm">None yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {bans.map((championId, index) => (
            <div key={`${championId}-${index}`} className="relative h-9 w-9 rounded-lg overflow-hidden opacity-70">
              <img src={championIconUrl(connection, championId)} alt="" className="h-full w-full bg-obsidian-raised" />
              <Ban className="absolute inset-0 m-auto h-4 w-4 text-danger" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function phaseLabel(phase: string): string {
  if (phase === "PLANNING") return "Declaring intent";
  if (phase === "BAN_PICK") return "Ban / pick phase";
  if (phase === "FINALIZATION") return "Finalizing";
  return "Champion select";
}
