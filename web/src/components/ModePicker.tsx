import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Lock, RefreshCw, Search, Swords } from "lucide-react";
import type { CustomGame, GameQueue } from "../types";
import { api, type Connection } from "../lib/api";
import { Badge, Card, SectionTitle } from "./ui/primitives";
import { Sheet } from "./ui/Sheet";

/**
 * The client's play menu, on a phone.
 *
 * Both of its levels come from the client rather than from anything listed here:
 * which tab a mode belongs in is derived from flags the agent resolves (`isBots`,
 * `isCustom`), and the heading beneath it is the map's own name. That is what
 * makes this survive Riot's rotations — Swiftplay files itself under Summoner's
 * Rift and the Mayhem codenames file themselves under ARAM, without this file
 * having heard of either.
 */
type TabId = "pvp" | "bots" | "training" | "create" | "join";

const TABS: { id: TabId; label: string; match?: (queue: GameQueue) => boolean }[] = [
  { id: "pvp", label: "PvP", match: (q) => !q.isBots && !q.isCustom },
  { id: "bots", label: "Co-op vs. AI", match: (q) => q.isBots && !q.isCustom },
  // Practice Tool is a custom lobby as far as the client is concerned; its menu
  // just files it under Training. Tutorial is not offered as a queue at all.
  { id: "training", label: "Training", match: (q) => q.isCustom && q.gameMode === "PRACTICETOOL" },
  {
    id: "create",
    label: "Create custom",
    match: (q) => q.isCustom && q.gameMode !== "PRACTICETOOL",
  },
  { id: "join", label: "Join custom" },
];

function tabFor(queues: GameQueue[], tabId: TabId): GameQueue[] {
  const tab = TABS.find((t) => t.id === tabId);
  return tab?.match ? queues.filter(tab.match) : [];
}

function group(queues: GameQueue[]): { label: string; queues: GameQueue[] }[] {
  const buckets = new Map<string, GameQueue[]>();
  for (const queue of queues) {
    const bucket = buckets.get(queue.group);
    if (bucket) bucket.push(queue);
    else buckets.set(queue.group, [queue]);
  }

  const lowestId = (list: GameQueue[]) => Math.min(...list.map((q) => q.id));

  return [...buckets.entries()]
    // Lowest queue id first. Riot hands ids out roughly in the order modes were
    // introduced, so Summoner's Rift lands on top and a freshly rotated mode near
    // the bottom — close to the client's own order, and stable, which sorting by
    // group size was not: one extra TFT variant pushed the Rift below it.
    .sort((a, b) => lowestId(a[1]) - lowestId(b[1]))
    .map(([label, list]) => ({
      label,
      // Ranked last, then by id: the client orders the Rift that way, and on a
      // phone it keeps the ones you least want to fat-finger furthest from your
      // thumb. Within a tier, ids already run in the expected order.
      queues: list.sort((a, b) => Number(a.isRanked) - Number(b.isRanked) || a.id - b.id),
    }));
}

export function ModePicker({
  connection,
  currentQueueId,
  currentQueueName,
  canChange,
  onToast,
}: {
  connection: Connection;
  currentQueueId: number;
  currentQueueName: string;
  canChange: boolean;
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("pvp");
  const [queues, setQueues] = useState<GameQueue[] | null>(null);
  const [busy, setBusy] = useState("");
  /** Which custom preset is being configured, if any. */
  const [configuring, setConfiguring] = useState<GameQueue | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setQueues(null);
    setTab("pvp");
    setConfiguring(null);
    void api
      .queues(connection)
      .then((next) => live && setQueues(next))
      .catch((error: Error) => {
        if (!live) return;
        setQueues([]);
        onToast(error.message, "error");
      });
    return () => {
      live = false;
    };
  }, [open, connection, onToast]);

  const act = (key: string, run: () => Promise<unknown>, success: string) => {
    setBusy(key);
    void run()
      .then(() => {
        onToast(success, "ok");
        setOpen(false);
        setConfiguring(null);
      })
      .catch((error: Error) => onToast(error.message, "error"))
      .finally(() => setBusy(""));
  };

  return (
    <Card>
      <SectionTitle accent="hextech">Game mode</SectionTitle>

      <button
        type="button"
        disabled={!canChange}
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 text-left disabled:opacity-40"
      >
        <span className="grid place-items-center h-10 w-10 rounded-xl border border-hextech/40 bg-hextech/10 text-hextech shrink-0">
          <Swords className="h-4 w-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-ink text-sm font-semibold truncate">
            {currentQueueId > 0
              ? currentQueueName || `Queue ${currentQueueId}`
              : "No lobby — pick a mode"}
          </span>
          <span className="block text-ink-dim text-xs mt-0.5">
            {canChange ? "Tap to change" : "Can't change mode right now"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-ink-dim shrink-0" />
      </button>

      <Sheet
        open={open}
        title={configuring ? configuring.name : "Pick a mode"}
        onClose={() => (configuring ? setConfiguring(null) : setOpen(false))}
      >
        {configuring ? (
          <CustomForm
            queue={configuring}
            busy={busy === `custom-${configuring.id}`}
            onCancel={() => setConfiguring(null)}
            onCreate={(options) =>
              act(
                `custom-${configuring.id}`,
                () => api.createCustom(connection, { queueId: configuring.id, ...options }),
                `${configuring.name} lobby created.`,
              )
            }
          />
        ) : queues === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-hextech" />
          </div>
        ) : queues.length === 0 ? (
          <p className="text-ink-dim text-sm py-6 text-center">
            The client did not offer any modes. Is it finished loading?
          </p>
        ) : (
          <div>
            {/* Only tabs with something in them — an empty tab is a dead end, and
                which ones have content is the client's call. Scrolls sideways
                rather than squeezing five labels across a phone. */}
            <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto no-scrollbar px-1">
              {TABS.filter((t) => t.id === "join" || tabFor(queues, t.id).length > 0).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    tab === t.id
                      ? "border-hextech/40 bg-hextech/15 text-hextech"
                      : "border-hairline bg-white/[0.03] text-ink-dim hover:text-ink-muted"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "join" ? (
              <JoinCustom
                connection={connection}
                busy={busy}
                onJoin={(game, password) =>
                  act(
                    `join-${game.partyId}`,
                    () => api.joinCustom(connection, game.partyId, password),
                    `Joined ${game.name}.`,
                  )
                }
                onToast={onToast}
              />
            ) : (
              <div className="space-y-6">
                {tab === "training" && (
                  <p className="text-ink-dim text-xs leading-relaxed">
                    Practice Tool opens as a lobby you start yourself. The client does not offer
                    its Tutorial as a queue, so that one cannot be launched from here.
                  </p>
                )}

                {group(tabFor(queues, tab)).map((family) => (
                  <div key={family.label}>
                    <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-ink-dim mb-2.5">
                      {family.label}
                    </h3>
                    <div className="space-y-1.5">
                      {family.queues.map((queue) => (
                        <QueueRow
                          key={queue.id}
                          queue={queue}
                          current={queue.id === currentQueueId}
                          busy={busy === `queue-${queue.id}` || busy === `custom-${queue.id}`}
                          disabled={busy !== ""}
                          onPick={() => {
                            // A custom preset needs a name and team size before it
                            // can be created; a plain queue is just an id.
                            if (tab === "create") {
                              setConfiguring(queue);
                              return;
                            }
                            if (tab === "training") {
                              act(
                                `custom-${queue.id}`,
                                () =>
                                  api.createCustom(connection, {
                                    queueId: queue.id,
                                    name: queue.name,
                                    teamSize: 5,
                                  }),
                                `${queue.name} lobby created.`,
                              );
                              return;
                            }
                            act(
                              `queue-${queue.id}`,
                              () => api.setQueue(connection, queue.id),
                              `${queue.name} lobby created.`,
                            );
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </Card>
  );
}

function QueueRow({
  queue,
  current,
  busy,
  disabled,
  onPick,
}: {
  queue: GameQueue;
  current: boolean;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-50 ${
        current
          ? "border-hextech/50 bg-hextech/10"
          : "border-hairline bg-white/[0.03] hover:border-hextech/30"
      }`}
    >
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-ink text-sm font-semibold truncate">{queue.name}</span>
          {queue.isRanked && <Badge tone="gold">Ranked</Badge>}
        </span>
        {/* Most modes describe themselves with their own name ("ARAM" / "ARAM");
            the description only earns a line when it says something new — which is
            the case that matters, since queue 400 is called "Normal" and only its
            description says "Draft Pick". */}
        {queue.description && queue.description !== queue.name && (
          <span className="block text-ink-dim text-xs mt-0.5 truncate">{queue.description}</span>
        )}
      </span>
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-hextech shrink-0" />
      ) : (
        current && (
          <span className="text-hextech text-[10px] font-bold uppercase tracking-wider shrink-0">
            Current
          </span>
        )
      )}
    </button>
  );
}

const SPECTATOR_CHOICES = [
  { value: "AllAllowed", label: "All" },
  { value: "FriendsAllowed", label: "Friends" },
  { value: "LobbyAllowed", label: "Lobby" },
  { value: "NotAllowed", label: "None" },
];

/** The same fields the client's own Create Custom screen asks for. */
function CustomForm({
  queue,
  busy,
  onCancel,
  onCreate,
}: {
  queue: GameQueue;
  busy: boolean;
  onCancel: () => void;
  onCreate: (options: {
    name: string;
    teamSize: number;
    password?: string;
    spectators?: string;
  }) => void;
}) {
  const [name, setName] = useState(queue.name);
  const [teamSize, setTeamSize] = useState(Math.min(queue.teamSize || 5, 5));
  const [password, setPassword] = useState("");
  const [spectators, setSpectators] = useState("AllAllowed");

  return (
    <div className="space-y-4">
      <Field label="Lobby name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="My game"
          className="w-full bg-transparent outline-none text-ink placeholder:text-ink-dim/60"
        />
      </Field>

      <Field label="Team size">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setTeamSize(size)}
              className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold transition-colors ${
                teamSize === size
                  ? "border-hextech/50 bg-hextech/15 text-hextech"
                  : "border-hairline text-ink-dim"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Password (optional)">
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="None"
          className="w-full bg-transparent outline-none text-ink placeholder:text-ink-dim/60"
        />
      </Field>

      <Field label="Spectators">
        <div className="flex gap-1.5">
          {SPECTATOR_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              onClick={() => setSpectators(choice.value)}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                spectators === choice.value
                  ? "border-hextech/50 bg-hextech/15 text-hextech"
                  : "border-hairline text-ink-dim"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-hairline py-3 text-xs font-bold uppercase tracking-wider text-ink-dim"
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onCreate({ name, teamSize, password, spectators })}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-hextech/40 bg-hextech/15 py-3 text-xs font-bold uppercase tracking-wider text-hextech disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Create
        </button>
      </div>
    </div>
  );
}

/** The public custom lobby browser. */
function JoinCustom({
  connection,
  busy,
  onJoin,
  onToast,
}: {
  connection: Connection;
  busy: string;
  onJoin: (game: CustomGame, password?: string) => void;
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const [games, setGames] = useState<CustomGame[] | null>(null);
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<CustomGame | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    let live = true;
    setGames(null);
    void api
      .customGames(connection)
      .then((next) => live && setGames(next))
      .catch((error: Error) => {
        if (!live) return;
        setGames([]);
        onToast(error.message, "error");
      });
    return () => {
      live = false;
    };
  }, [connection, onToast]);

  const refresh = () => {
    setGames(null);
    void api
      .customGames(connection)
      .then(setGames)
      .catch((error: Error) => {
        setGames([]);
        onToast(error.message, "error");
      });
  };

  const needle = query.trim().toLowerCase();
  const shown = (games ?? []).filter(
    (game) =>
      !needle ||
      game.name.toLowerCase().includes(needle) ||
      game.owner.toLowerCase().includes(needle),
  );

  if (asking) {
    return (
      <div className="space-y-4">
        <p className="text-ink text-sm font-semibold">{asking.name}</p>
        <Field label="Lobby password">
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full bg-transparent outline-none text-ink"
          />
        </Field>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setAsking(null);
              setPassword("");
            }}
            className="flex-1 rounded-xl border border-hairline py-3 text-xs font-bold uppercase tracking-wider text-ink-dim"
          >
            Back
          </button>
          <button
            type="button"
            disabled={busy !== ""}
            onClick={() => onJoin(asking, password)}
            className="flex-1 rounded-xl border border-hextech/40 bg-hextech/15 py-3 text-xs font-bold uppercase tracking-wider text-hextech disabled:opacity-50"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2.5">
          <Search className="h-3.5 w-3.5 text-ink-dim shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a game"
            className="min-w-0 flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-dim/60"
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          className="grid place-items-center h-[42px] w-[42px] rounded-xl border border-hairline bg-white/[0.03] text-ink-dim hover:text-hextech"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {games === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-hextech" />
        </div>
      ) : shown.length === 0 ? (
        <p className="text-ink-dim text-sm py-6 text-center">
          {games.length === 0 ? "No public lobbies right now." : "Nothing matches that."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {shown.map((game) => (
            <button
              key={game.partyId}
              type="button"
              disabled={busy !== ""}
              onClick={() => (game.hasPassword ? setAsking(game) : onJoin(game))}
              className="w-full flex items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] px-3.5 py-3 text-left hover:border-hextech/30 disabled:opacity-50"
            >
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  {game.hasPassword && <Lock className="h-3 w-3 text-gold shrink-0" />}
                  <span className="text-ink text-sm font-semibold truncate">{game.name}</span>
                </span>
                <span className="block text-ink-dim text-xs mt-0.5 truncate">
                  {game.owner}
                  {game.map ? ` · ${game.map}` : ""}
                </span>
              </span>
              <span className="text-ink-dim text-xs tabular-nums shrink-0">
                {game.players}/{game.maxPlayers}
              </span>
              {busy === `join-${game.partyId}` && (
                <Loader2 className="h-4 w-4 animate-spin text-hextech shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim mb-1.5">
        {label}
      </label>
      <div className="rounded-xl border border-hairline bg-white/[0.03] px-3.5 py-2.5 focus-within:border-hextech/50 transition-colors">
        {children}
      </div>
    </div>
  );
}
