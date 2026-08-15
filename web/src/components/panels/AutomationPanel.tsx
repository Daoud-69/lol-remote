import { useState } from "react";
import { ChevronRight, Target } from "lucide-react";
import { api, championIconUrl, spellIconUrl, type Connection } from "../../lib/api";
import type { AgentState, AutomationSettings, Champion, SummonerSpell } from "../../types";
import { ChampionGrid } from "../ChampionGrid";
import { Sheet } from "../ui/Sheet";
import { Card, Muted, SectionTitle, Toggle } from "../ui/primitives";

export function AutomationPanel({
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
  const settings = state.automation;
  const [picker, setPicker] = useState<null | "pick" | "ban">(null);

  const update = async (patch: Partial<AutomationSettings>) => {
    try {
      await api.setAutomation(connection, patch);
    } catch (error) {
      onToast((error as Error).message, "error");
    }
  };

  const championName = (id: number) => {
    if (id <= 0) return "None";
    return champions.find((c) => c.id === id)?.name ?? `Champion ${id}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle accent="gold">Ready check</SectionTitle>
        <ToggleRow label="Auto-accept queue" help="Accepts the match the moment it pops." value={settings.autoAccept} onChange={(v) => void update({ autoAccept: v })} />
        {settings.autoAccept && (
          <div className="mt-3">
            <p className="text-ink-muted text-xs mb-2">Wait {settings.autoAcceptDelayMs === 0 ? "no time" : `${settings.autoAcceptDelayMs / 1000}s`} before accepting</p>
            <ChipRow value={settings.autoAcceptDelayMs} options={[0, 1500, 4000, 8000]} format={(ms) => (ms === 0 ? "Instant" : `${ms / 1000}s`)} onChange={(ms) => void update({ autoAcceptDelayMs: ms })} />
            <Muted>A delay leaves you a window to decline from the phone.</Muted>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Auto pick</SectionTitle>
        <PickerRow
          icon={championName(settings.autoPickChampionId)}
          sub="Hovered the instant it is your turn"
          iconUrl={settings.autoPickChampionId > 0 ? championIconUrl(connection, settings.autoPickChampionId) : null}
          onClick={() => setPicker("pick")}
        />
        <ToggleRow label="Lock in automatically" help="Off means it only hovers, leaving the lock to you." value={settings.autoPickLock} onChange={(v) => void update({ autoPickLock: v })} />
        {settings.autoPickChampionId > 0 && (
          <button onClick={() => void update({ autoPickChampionId: 0 })} className="mt-3 text-xs text-ink-dim hover:text-ink-muted transition-colors">
            Clear auto pick
          </button>
        )}
      </Card>

      <Card>
        <SectionTitle>Auto ban</SectionTitle>
        <PickerRow icon={championName(settings.autoBanChampionId)} iconUrl={settings.autoBanChampionId > 0 ? championIconUrl(connection, settings.autoBanChampionId) : null} onClick={() => setPicker("ban")} />
        <ToggleRow label="Lock ban automatically" help="Bans are rarely worth hesitating over." value={settings.autoBanLock} onChange={(v) => void update({ autoBanLock: v })} />
        {settings.autoBanChampionId > 0 && (
          <button onClick={() => void update({ autoBanChampionId: 0 })} className="mt-3 text-xs text-ink-dim hover:text-ink-muted transition-colors">
            Clear auto ban
          </button>
        )}
      </Card>

      <Card>
        <SectionTitle>Preset summoner spells</SectionTitle>
        <Muted>Applied as soon as champion select opens.</Muted>
        <div className="grid grid-cols-2 gap-4 mt-3">
          {([1, 2] as const).map((slot) => {
            const current = slot === 1 ? settings.autoSpell1Id : settings.autoSpell2Id;
            return (
              <div key={slot}>
                <p className="text-ink-dim text-xs mb-1.5">Slot {slot}</p>
                <div className="flex flex-wrap gap-1.5">
                  {spells.map((spell) => {
                    const active = current === spell.id;
                    return (
                      <button
                        key={spell.id}
                        onClick={() => void update(slot === 1 ? { autoSpell1Id: active ? 0 : spell.id } : { autoSpell2Id: active ? 0 : spell.id })}
                        className={`rounded-lg border-2 p-0.5 transition-colors ${active ? "border-gold" : "border-transparent"}`}
                      >
                        <img src={spellIconUrl(connection, spell.iconPath)} alt={spell.name} className="h-7 w-7 rounded-md bg-obsidian-raised" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle accent="danger">Safety net</SectionTitle>
        <p className="text-ink-muted text-sm mb-2">
          {settings.panicLockAtSeconds > 0 ? `Lock whatever is hovered with ${settings.panicLockAtSeconds}s left` : "Never force a lock"}
        </p>
        <ChipRow value={settings.panicLockAtSeconds} options={[0, 3, 5, 8]} format={(s) => (s === 0 ? "Off" : `${s}s`)} onChange={(s) => void update({ panicLockAtSeconds: s })} />
        <Muted>Commits whatever is hovered before the timer expires, so a phone that loses signal mid-select does not leave you with a random champion.</Muted>
      </Card>

      <Sheet open={picker !== null} title={picker === "ban" ? "Champion to auto-ban" : "Champion to auto-pick"} onClose={() => setPicker(null)}>
        <div className="h-[55svh]">
          <ChampionGrid
            champions={champions}
            connection={connection}
            selectedId={picker === "ban" ? settings.autoBanChampionId : settings.autoPickChampionId}
            mode={picker === "ban" ? "ban" : "pick"}
            onSelect={(championId) => {
              void update(picker === "ban" ? { autoBanChampionId: championId } : { autoPickChampionId: championId });
              setPicker(null);
            }}
          />
        </div>
      </Sheet>
    </div>
  );
}

function ToggleRow({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange: (v: boolean) => void }) {
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

function ChipRow({ value, options, format, onChange }: { value: number; options: number[]; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2 mb-2 flex-wrap">
      {options.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
              active ? "border-gold bg-gold/10 text-gold" : "border-hairline bg-white/[0.03] text-ink-muted"
            }`}
          >
            {format(option)}
          </button>
        );
      })}
    </div>
  );
}

function PickerRow({ icon, sub, iconUrl, onClick }: { icon: string; sub?: string; iconUrl: string | null; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 py-2 group">
      {iconUrl ? (
        <img src={iconUrl} alt="" className="h-11 w-11 rounded-lg bg-obsidian-raised" />
      ) : (
        <div className="h-11 w-11 rounded-lg bg-obsidian-raised border border-dashed border-hairline flex items-center justify-center">
          <Target className="h-4 w-4 text-ink-dim" />
        </div>
      )}
      <span className="flex-1 text-left min-w-0">
        <span className="block text-ink font-semibold text-sm truncate">{icon}</span>
        {sub && <span className="block text-ink-dim text-[11px] mt-0.5">{sub}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-ink-dim group-hover:text-ink-muted transition-colors" />
    </button>
  );
}
