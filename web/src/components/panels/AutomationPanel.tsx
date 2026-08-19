import { useCallback, useState } from "react";
import { BellRing, ChevronRight, Sparkles } from "lucide-react";
import { api, championIconUrl, spellIconUrl, type Connection } from "../../lib/api";
import { useAutomation } from "../../hooks/useAutomation";
import type { useAlerts } from "../../hooks/useAlerts";
import {
  POSITIONS,
  type AgentState,
  type AutomationSettings,
  type Champion,
  type Position,
  type RolePreset,
  type RunePage,
  type SummonerSpell,
} from "../../types";
import { ChampionGrid } from "../ChampionGrid";
import { ChampionSlots } from "../ChampionSlots";
import { RolePicker, positionLabel } from "../RolePicker";
import { RuneEditor } from "../RuneEditor";
import { Sheet } from "../ui/Sheet";
import { Card, Muted, SectionTitle, Toggle } from "../ui/primitives";

/** Which list a champion picker is currently filling. */
type PickerTarget =
  | { kind: "role"; position: Position }
  | { kind: "fallback" }
  | { kind: "ban" }
  | { kind: "rune" };

/** "No role" stands in for ARAM, blind pick and customs, which assign nothing. */
type RoleTab = Position | "NONE";

export function AutomationPanel({
  state,
  connection,
  champions,
  spells,
  onToast,
  alerts,
}: {
  state: AgentState;
  connection: Connection;
  champions: Champion[];
  spells: SummonerSpell[];
  onToast: (message: string, kind: "ok" | "error") => void;
  alerts: ReturnType<typeof useAlerts>;
}) {
  const onError = useCallback((message: string) => onToast(message, "error"), [onToast]);
  const [settings, update] = useAutomation(state.automation, connection, onError);
  const assigned = state.champSelect?.myAssignedPosition ?? "";

  // Default the editor to the role you're actually in, which is where you'll
  // want to be looking when champ select is live.
  const [tab, setTab] = useState<RoleTab>(() =>
    isPosition(assigned) ? assigned : firstMeaningfulRole(settings),
  );
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [runeChampionId, setRuneChampionId] = useState(0);

  const championName = (id: number) =>
    champions.find((c) => c.id === id)?.name ?? `Champion ${id}`;

  const preset: RolePreset =
    tab === "NONE"
      ? { championIds: settings.fallbackChampionIds, spell1Id: 0, spell2Id: 0 }
      : settings.rolePresets[tab];

  const setPresetChampions = (next: number[]) => {
    if (tab === "NONE") {
      update({ fallbackChampionIds: next });
      return;
    }
    update({ rolePresets: { [tab]: { ...preset, championIds: next } } });
  };

  const setPresetSpell = (slot: 1 | 2, spellId: number) => {
    if (tab === "NONE") return;
    const key = slot === 1 ? "spell1Id" : "spell2Id";
    update({ rolePresets: { [tab]: { ...preset, [key]: spellId } } });
  };

  const onGridSelect = (championId: number) => {
    if (!picker) return;
    if (picker.kind === "rune") {
      setRuneChampionId(championId);
      setPicker(null);
      return;
    }
    if (picker.kind === "ban") {
      update({ banChampionIds: [...settings.banChampionIds, championId] });
    } else if (picker.kind === "fallback") {
      update({ fallbackChampionIds: [...settings.fallbackChampionIds, championId] });
    } else {
      const current = settings.rolePresets[picker.position];
      update({
        rolePresets: {
          [picker.position]: { ...current, championIds: [...current.championIds, championId] },
        },
      });
    }
    setPicker(null);
  };

  const runeChampionIds = Object.keys(settings.runePages).map(Number).filter(Boolean);

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle accent="gold">Ready check</SectionTitle>
        <ToggleRow
          label="Auto-accept queue"
          help="Accepts the match the moment it pops."
          value={settings.autoAccept}
          onChange={(v) => update({ autoAccept: v })}
        />
        {settings.autoAccept && (
          <div className="mt-3">
            <p className="text-ink-muted text-xs mb-2">
              Wait {settings.autoAcceptDelayMs === 0 ? "no time" : `${settings.autoAcceptDelayMs / 1000}s`} before accepting
            </p>
            <ChipRow
              value={settings.autoAcceptDelayMs}
              options={[0, 1500, 4000, 8000]}
              format={(ms) => (ms === 0 ? "Instant" : `${ms / 1000}s`)}
              onChange={(ms) => update({ autoAcceptDelayMs: ms })}
            />
            <Muted>A delay leaves you a window to decline from the phone.</Muted>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle accent="danger">Alarm</SectionTitle>
        <Muted>Rings the phone, so you can be across the room.</Muted>

        <ToggleRow
          label="Ring when the game starts"
          help="The moment you need to be back at the PC."
          value={alerts.prefs.gameStart}
          onChange={(v) => alerts.setPrefs((p) => ({ ...p, gameStart: v }))}
        />
        <ToggleRow
          label="Ring when a match is found"
          help="Useful mainly with auto-accept off."
          value={alerts.prefs.readyCheck}
          onChange={(v) => alerts.setPrefs((p) => ({ ...p, readyCheck: v }))}
        />
        <ToggleRow
          label="Chirp on your pick or ban turn"
          help="Quieter, for when you are already watching."
          value={alerts.prefs.turn}
          onChange={(v) => alerts.setPrefs((p) => ({ ...p, turn: v }))}
        />
        <ToggleRow
          label="Show a notification"
          help="Reaches you with the app closed or the screen off."
          value={alerts.prefs.notifications}
          onChange={(v) => {
            if (v && !alerts.canNotify) {
              void alerts.requestNotifications().then((granted) => {
                if (!granted) onToast("Notifications are blocked in your settings.", "error");
              });
              return;
            }
            alerts.setPrefs((p) => ({ ...p, notifications: v }));
          }}
        />

        <button
          type="button"
          onClick={() => alerts.test("game-start")}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-white/[0.04] py-2.5 text-xs font-bold uppercase tracking-wider text-ink-muted transition-colors hover:border-white/25 hover:text-ink"
        >
          <BellRing className="h-4 w-4" />
          Test the alarm
        </button>
        <Muted>
          Phones stay silent until you have tapped the screen at least once, so test it here rather
          than finding out mid-queue.
        </Muted>
      </Card>

      <RolePicker lobby={state.lobby} connection={connection} onToast={onToast} />

      <Card>
        <SectionTitle>Picks per role</SectionTitle>
        <Muted>
          The agent uses the list for whichever role you actually get, and takes the first
          champion still available.
        </Muted>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...POSITIONS, "NONE" as const].map((role) => {
            const count =
              role === "NONE"
                ? settings.fallbackChampionIds.length
                : settings.rolePresets[role].championIds.length;
            const live = role === assigned;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setTab(role)}
                className={`relative rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  tab === role
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-hairline bg-white/[0.03] text-ink-muted"
                }`}
              >
                {role === "NONE" ? "No role" : positionLabel(role)}
                {count > 0 && <span className="ml-1 text-ink-dim">{count}</span>}
                {live && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-hextech shadow-[0_0_8px_rgba(10,200,185,0.9)]" />
                )}
              </button>
            );
          })}
        </div>

        {state.champSelect?.autofilled && isPosition(assigned) && (
          <p className="mt-3 rounded-lg border border-hextech/30 bg-hextech/10 px-3 py-2 text-[11px] text-hextech">
            Autofilled to {positionLabel(assigned)} — that list is the one in play.
          </p>
        )}

        <div className="mt-4">
          <ChampionSlots
            championIds={preset.championIds}
            champions={champions}
            connection={connection}
            mode="pick"
            emptyLabel={
              tab === "NONE"
                ? "Used in ARAM, blind pick and customs, where no role is assigned."
                : `Nothing set for ${positionLabel(tab)} yet.`
            }
            onChange={setPresetChampions}
            onPick={() =>
              setPicker(tab === "NONE" ? { kind: "fallback" } : { kind: "role", position: tab })
            }
          />
        </div>

        {tab !== "NONE" && (
          <div className="mt-4 border-t border-hairline pt-3">
            <p className="text-ink-dim text-xs mb-2">
              Spells for {positionLabel(tab)}{" "}
              <span className="text-ink-dim/70">— overrides the preset below</span>
            </p>
            <div className="grid grid-cols-2 gap-4">
              {([1, 2] as const).map((slot) => {
                const current = slot === 1 ? preset.spell1Id : preset.spell2Id;
                return (
                  <div key={slot}>
                    <p className="text-ink-dim text-[11px] mb-1.5">Slot {slot}</p>
                    <SpellRow
                      spells={spells}
                      connection={connection}
                      current={current}
                      onSelect={(id) => setPresetSpell(slot, current === id ? 0 : id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-hairline pt-1">
          <ToggleRow
            label="Declare in the planning phase"
            help="Shows your champion to the team before bans start."
            value={settings.declarePickIntent}
            onChange={(v) => update({ declarePickIntent: v })}
          />
          <ToggleRow
            label="Lock in automatically"
            help="Off means it only hovers, leaving the lock to you."
            value={settings.autoPickLock}
            onChange={(v) => update({ autoPickLock: v })}
          />
        </div>
      </Card>

      <Card>
        <SectionTitle accent="danger">Bans</SectionTitle>
        <Muted>Tried in order — if your first is already banned, the next one goes.</Muted>
        <div className="mt-3">
          <ChampionSlots
            championIds={settings.banChampionIds}
            champions={champions}
            connection={connection}
            mode="ban"
            emptyLabel="No auto-ban set."
            onChange={(next) => update({ banChampionIds: next })}
            onPick={() => setPicker({ kind: "ban" })}
          />
        </div>
        <ToggleRow
          label="Never ban a teammate's pick"
          help="Skips anyone your team has already declared."
          value={settings.protectTeammatePicks}
          onChange={(v) => update({ protectTeammatePicks: v })}
        />
        <ToggleRow
          label="Lock ban automatically"
          help="Bans are rarely worth hesitating over."
          value={settings.autoBanLock}
          onChange={(v) => update({ autoBanLock: v })}
        />
      </Card>

      <Card>
        <SectionTitle accent="hextech">Runes</SectionTitle>
        <ToggleRow
          label="Apply runes on lock"
          help="Writes the saved page for whatever you lock in."
          value={settings.applyRunes}
          onChange={(v) => update({ applyRunes: v })}
        />

        <div className="mt-3 space-y-2">
          {runeChampionIds.map((championId) => (
            <button
              key={championId}
              type="button"
              onClick={() => setRuneChampionId(championId)}
              className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] p-2 text-left transition-colors hover:border-hextech/40"
            >
              <img
                src={championIconUrl(connection, championId)}
                alt=""
                className="h-9 w-9 rounded-lg bg-obsidian-raised"
              />
              <span className="flex-1 truncate text-sm font-semibold text-ink">
                {championName(championId)}
              </span>
              <ChevronRight className="h-4 w-4 text-ink-dim" />
            </button>
          ))}

          <button
            type="button"
            onClick={() => setPicker({ kind: "rune" })}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-hairline p-2.5 text-ink-dim transition-colors hover:border-white/25 hover:text-ink-muted"
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold">Set runes for a champion</span>
          </button>
        </div>

        <Muted>
          The agent keeps one page of its own and rewrites it — your saved pages are left
          alone.
        </Muted>
      </Card>

      <Card>
        <SectionTitle>Fallback summoner spells</SectionTitle>
        <Muted>Used for any role without its own spells set.</Muted>
        <div className="grid grid-cols-2 gap-4 mt-3">
          {([1, 2] as const).map((slot) => {
            const current = slot === 1 ? settings.autoSpell1Id : settings.autoSpell2Id;
            return (
              <div key={slot}>
                <p className="text-ink-dim text-xs mb-1.5">Slot {slot}</p>
                <SpellRow
                  spells={spells}
                  connection={connection}
                  current={current}
                  onSelect={(id) =>
                    update(
                      slot === 1
                        ? { autoSpell1Id: current === id ? 0 : id }
                        : { autoSpell2Id: current === id ? 0 : id },
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle accent="danger">Safety net</SectionTitle>
        <p className="text-ink-muted text-sm mb-2">
          {settings.panicLockAtSeconds > 0
            ? `Lock whatever is hovered with ${settings.panicLockAtSeconds}s left`
            : "Never force a lock"}
        </p>
        <ChipRow
          value={settings.panicLockAtSeconds}
          options={[0, 3, 5, 8]}
          format={(s) => (s === 0 ? "Off" : `${s}s`)}
          onChange={(s) => update({ panicLockAtSeconds: s })}
        />
        <Muted>
          Commits whatever is hovered before the timer expires, so a phone that loses signal
          mid-select does not leave you with a random champion.
        </Muted>
      </Card>

      <Sheet
        open={picker !== null}
        title={
          picker?.kind === "ban"
            ? "Champion to ban"
            : picker?.kind === "rune"
              ? "Runes for which champion?"
              : "Champion to pick"
        }
        onClose={() => setPicker(null)}
      >
        <div className="h-[55svh]">
          <ChampionGrid
            champions={champions}
            connection={connection}
            selectedId={0}
            mode={picker?.kind === "ban" ? "ban" : "pick"}
            onSelect={onGridSelect}
          />
        </div>
      </Sheet>

      <Sheet
        open={runeChampionId > 0}
        title={`${championName(runeChampionId)} runes`}
        onClose={() => setRuneChampionId(0)}
      >
        {runeChampionId > 0 && (
          <RuneEditor
            championId={runeChampionId}
            championName={championName(runeChampionId)}
            position={tab === "NONE" ? "" : tab}
            connection={connection}
            initial={settings.runePages[runeChampionId]}
            onToast={onToast}
            onSave={(page: RunePage) => {
              update({ runePages: { [runeChampionId]: page } });
              onToast(`Saved runes for ${championName(runeChampionId)}.`, "ok");
              setRuneChampionId(0);
            }}
            onClear={() => {
              void api
                .clearRunePage(connection, runeChampionId)
                .catch((error: Error) => onToast(error.message, "error"));
              setRuneChampionId(0);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function isPosition(value: string): value is Position {
  return (POSITIONS as string[]).includes(value);
}

/** Opens on a role you've actually configured, rather than always on Top. */
function firstMeaningfulRole(settings: AutomationSettings): RoleTab {
  const configured = POSITIONS.find(
    (position) => settings.rolePresets[position]?.championIds.length > 0,
  );
  if (configured) return configured;
  if (settings.primaryPosition !== "UNSELECTED" && settings.primaryPosition !== "FILL") {
    return settings.primaryPosition;
  }
  return "TOP";
}

function SpellRow({
  spells,
  connection,
  current,
  onSelect,
}: {
  spells: SummonerSpell[];
  connection: Connection;
  current: number;
  onSelect: (spellId: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {spells.map((spell) => (
        <button
          key={spell.id}
          type="button"
          onClick={() => onSelect(spell.id)}
          aria-label={spell.name}
          aria-pressed={current === spell.id}
          className={`rounded-lg border-2 p-0.5 transition-colors ${
            current === spell.id ? "border-gold" : "border-transparent"
          }`}
        >
          <img
            src={spellIconUrl(connection, spell.iconPath)}
            alt={spell.name}
            className="h-7 w-7 rounded-md bg-obsidian-raised"
          />
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 mt-3">
      <div className="flex-1">
        <p className="text-ink text-sm font-semibold">{label}</p>
        <p className="text-ink-dim text-xs mt-0.5">{help}</p>
      </div>
      <Toggle value={value} onChange={onChange} label={label} />
    </div>
  );
}

function ChipRow({
  value,
  options,
  format,
  onChange,
}: {
  value: number;
  options: number[];
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-2 mb-2 flex-wrap">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
            value === option
              ? "border-gold bg-gold/10 text-gold"
              : "border-hairline bg-white/[0.03] text-ink-muted"
          }`}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}
