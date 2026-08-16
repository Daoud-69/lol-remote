import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type Connection } from "../lib/api";
import { POSITIONS, type LobbyPositions, type PositionPreference } from "../types";
import { Card, Muted, SectionTitle } from "./ui/primitives";

export const POSITION_LABELS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
  FILL: "Fill",
  UNSELECTED: "Any",
};

export function positionLabel(position: string): string {
  return POSITION_LABELS[position.toUpperCase()] ?? position;
}

const CHOICES: PositionPreference[] = [...POSITIONS, "FILL"];

/**
 * The lobby's role selector, mirrored onto the phone.
 *
 * Writes straight through to the client rather than being stored and applied
 * later — the selector only exists while a lobby is open, and a preference the
 * client never saw would be a lie on screen.
 */
export function RolePicker({
  lobby,
  connection,
  onToast,
}: {
  lobby: LobbyPositions | null;
  connection: Connection;
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const [busy, setBusy] = useState(false);

  const first = lobby?.first ?? "UNSELECTED";
  const second = lobby?.second ?? "UNSELECTED";

  const apply = async (nextFirst: PositionPreference, nextSecond: PositionPreference) => {
    setBusy(true);
    try {
      await api.setPositions(connection, nextFirst, nextSecond);
    } catch (error) {
      onToast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  // Choosing "Fill" for the primary makes a secondary meaningless, and the
  // client rejects the same role twice — so picking a clashing role swaps them
  // rather than erroring.
  const chooseFirst = (choice: PositionPreference) => {
    if (choice === first) return;
    const nextSecond = choice === "FILL" ? "UNSELECTED" : second === choice ? first : second;
    void apply(choice, nextSecond as PositionPreference);
  };

  const chooseSecond = (choice: PositionPreference) => {
    const next = choice === second ? "UNSELECTED" : choice;
    void apply(first, next === first ? "UNSELECTED" : next);
  };

  if (lobby && !lobby.selectable) {
    return (
      <Card>
        <SectionTitle accent="hextech">Roles</SectionTitle>
        <Muted>This queue has no role selector.</Muted>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle accent="hextech">
        Roles {busy && <Loader2 className="inline h-3 w-3 animate-spin" />}
      </SectionTitle>

      {!lobby ? (
        <Muted>Open a lobby on your PC to choose roles.</Muted>
      ) : (
        <>
          <p className="text-ink-dim text-xs mb-2">Primary</p>
          <ChipRow choices={CHOICES} value={first} onChange={chooseFirst} tone="gold" />

          {first !== "FILL" && (
            <>
              <p className="text-ink-dim text-xs mb-2 mt-4">Secondary</p>
              <ChipRow
                choices={CHOICES.filter((choice) => choice !== first)}
                value={second}
                onChange={chooseSecond}
                tone="hextech"
              />
            </>
          )}

          <Muted>
            {first === "FILL"
              ? "Filling — you could land anywhere, so set a champion for every role below."
              : "Get autofilled and the agent picks from that role's list instead."}
          </Muted>
        </>
      )}
    </Card>
  );
}

function ChipRow({
  choices,
  value,
  onChange,
  tone,
}: {
  choices: PositionPreference[];
  value: PositionPreference;
  onChange: (choice: PositionPreference) => void;
  tone: "gold" | "hextech";
}) {
  const active =
    tone === "gold"
      ? "border-gold bg-gold/10 text-gold"
      : "border-hextech bg-hextech/10 text-hextech";

  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => onChange(choice)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === choice ? active : "border-hairline bg-white/[0.03] text-ink-muted"
          }`}
        >
          {positionLabel(choice)}
        </button>
      ))}
    </div>
  );
}
