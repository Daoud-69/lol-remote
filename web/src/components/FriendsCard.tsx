import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  FolderInput,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { Friend, FriendGroup, FriendStatus } from "../types";
import { api, profileIconUrl, type Connection } from "../lib/api";
import { Card, SectionTitle } from "./ui/primitives";
import { Sheet } from "./ui/Sheet";

/**
 * Friends: who is around, whose party you can join, and who you can pull into
 * yours — plus two ways to organise the list, since one person's idea of a
 * useful order is not everyone's.
 *
 * **By status.** The statuses arrive resolved from the agent, which needs three
 * LCU fields to work each one out — `availability` is only a chat status ("dnd"
 * for everybody in a game), `lol.gameStatus` is the real game state, and
 * `product` says whether they are on League at all. The order of the buckets
 * ("In game" above "Online", or the reverse) is a preference with no single
 * right answer, so it is stored per device rather than fixed here.
 *
 * **By group.** The client's own friend groups — the ones its social panel lets
 * you make — are read and managed directly, so a friend organised there shows up
 * organised the same way here.
 *
 * A party is only joinable when its owner left it open. Closed parties are still
 * listed rather than hidden: most parties are closed, and the useful thing there
 * is to invite them to yours instead.
 */
const DEFAULT_STATUS_ORDER: { status: FriendStatus; label: string }[] = [
  { status: "inGame", label: "In game" },
  { status: "online", label: "Online" },
  { status: "championSelect", label: "Champion select" },
  { status: "inParty", label: "In a party" },
  { status: "mobile", label: "Riot Mobile" },
  { status: "otherGame", label: "Other Riot games" },
  { status: "offline", label: "Offline" },
];

const LABELS: Record<FriendStatus, string> = Object.fromEntries(
  DEFAULT_STATUS_ORDER.map((g) => [g.status, g.label]),
) as Record<FriendStatus, string>;

const ORDER_KEY = "lol-remote:friendStatusOrder";

/**
 * The saved order, repaired against the known statuses rather than trusted
 * outright — a status introduced after someone last saved their order should
 * still appear, and one that no longer exists should not leave a gap.
 */
function loadStatusOrder(): FriendStatus[] {
  const known = DEFAULT_STATUS_ORDER.map((g) => g.status);
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return known;
    const kept = saved.filter((value): value is FriendStatus =>
      known.includes(value as FriendStatus),
    );
    const missing = known.filter((status) => !kept.includes(status));
    return [...kept, ...missing];
  } catch {
    return known;
  }
}

function saveStatusOrder(order: FriendStatus[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}

/**
 * Who an invite can actually reach.
 *
 * Only a friend sitting in the client with nothing running — idle, or in a party
 * of their own. An invite does not reach somebody mid-game or in champion select,
 * is not deliverable to the Riot Mobile app, and obviously not to anyone offline.
 * Offering the button to them would only produce a failure, so it is not offered.
 */
const INVITABLE: FriendStatus[] = ["online", "inParty"];

/** How many of a group to draw before folding the rest into a count. */
const CAP = 30;

type View = "status" | "groups";

export function FriendsCard({
  connection,
  canJoin,
  inLobby,
  onToast,
}: {
  connection: Connection;
  /** False mid-champ-select or in a game, when the client refuses anyway. */
  canJoin: boolean;
  /** There has to be a lobby before anyone can be invited into it. */
  inLobby: boolean;
  onToast: (message: string, kind: "ok" | "error") => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("status");
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [groups, setGroups] = useState<FriendGroup[] | null>(null);
  const [busy, setBusy] = useState("");
  const [riotId, setRiotId] = useState("");
  /** Who has already been invited this session, so the button can say so. */
  const [invited, setInvited] = useState<string[]>([]);
  const [showOffline, setShowOffline] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [statusOrder, setStatusOrder] = useState<FriendStatus[]>(loadStatusOrder);
  const [movingFriend, setMovingFriend] = useState<Friend | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<{ id: number; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const loadFriends = () => {
    setFriends(null);
    void api
      .friends(connection)
      .then(setFriends)
      .catch((error: Error) => {
        setFriends([]);
        onToast(error.message, "error");
      });
  };

  const loadGroups = () => {
    setGroups(null);
    void api
      .friendGroups(connection)
      .then(setGroups)
      .catch((error: Error) => {
        setGroups([]);
        onToast(error.message, "error");
      });
  };

  useEffect(() => {
    if (!open) return;
    let live = true;
    setFriends(null);
    setGroups(null);
    setRiotId("");
    setInvited([]);
    setShowOffline(false);
    setView("status");
    setReordering(false);
    setMovingFriend(null);
    setNewGroupName("");
    setEditingGroup(null);
    setConfirmDelete(null);
    void api
      .friends(connection)
      .then((next) => live && setFriends(next))
      .catch((error: Error) => {
        if (!live) return;
        setFriends([]);
        onToast(error.message, "error");
      });
    return () => {
      live = false;
    };
  }, [open, connection, onToast]);

  // Groups are fetched lazily — most sessions never open that tab, and the
  // client has to be asked separately for them.
  useEffect(() => {
    if (!open || view !== "groups" || groups !== null) return;
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  const act = (key: string, run: () => Promise<unknown>, success: string, close = true) => {
    setBusy(key);
    void run()
      .then(() => {
        onToast(success, "ok");
        if (close) setOpen(false);
      })
      .catch((error: Error) => onToast(error.message, "error"))
      .finally(() => setBusy(""));
  };

  const invite = (friend: Friend) =>
    act(
      `invite-${friend.puuid}`,
      () =>
        api.inviteFriends(connection, [friend.puuid]).then(() => {
          setInvited((current) => [...current, friend.puuid]);
        }),
      `Invited ${friend.name}.`,
      // Stays open: inviting one person usually means inviting a few.
      false,
    );

  const moveOrder = (status: FriendStatus, delta: -1 | 1) => {
    setStatusOrder((current) => {
      const index = current.indexOf(status);
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      saveStatusOrder(next);
      return next;
    });
  };

  const moveFriend = (friend: Friend, groupId: number) => {
    setBusy(`move-${friend.puuid}`);
    void api
      .moveFriendToGroup(connection, friend.puuid, groupId)
      .then(() => {
        const target = groups?.find((group) => group.id === groupId);
        setFriends((current) =>
          (current ?? []).map((f) =>
            f.puuid === friend.puuid
              ? { ...f, groupId, groupName: target?.name ?? "Ungrouped" }
              : f,
          ),
        );
        onToast(`Moved ${friend.name} to ${target?.name ?? "Ungrouped"}.`, "ok");
        setMovingFriend(null);
      })
      .catch((error: Error) => onToast(error.message, "error"))
      .finally(() => setBusy(""));
  };

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    setBusy("create-group");
    void api
      .createFriendGroup(connection, name)
      .then((next) => {
        setGroups(next);
        setNewGroupName("");
        onToast(`Created "${name}".`, "ok");
      })
      .catch((error: Error) => onToast(error.message, "error"))
      .finally(() => setBusy(""));
  };

  const renameGroup = (id: number) => {
    const name = editingGroup?.name.trim();
    if (!name) return;
    setBusy(`rename-${id}`);
    void api
      .renameFriendGroup(connection, id, name)
      .then((next) => {
        setGroups(next);
        setFriends((current) =>
          (current ?? []).map((f) => (f.groupId === id ? { ...f, groupName: name } : f)),
        );
        setEditingGroup(null);
      })
      .catch((error: Error) => onToast(error.message, "error"))
      .finally(() => setBusy(""));
  };

  const deleteGroup = (group: FriendGroup) => {
    setBusy(`delete-${group.id}`);
    void api
      .deleteFriendGroup(connection, group.id)
      .then((next) => {
        setGroups(next);
        // The client itself relocates that group's friends to Ungrouped rather
        // than orphaning them, so the local copy follows suit.
        setFriends((current) =>
          (current ?? []).map((f) =>
            f.groupId === group.id ? { ...f, groupId: 0, groupName: "Ungrouped" } : f,
          ),
        );
        onToast(`Deleted "${group.name}".`, "ok");
        setConfirmDelete(null);
      })
      .catch((error: Error) => onToast(error.message, "error"))
      .finally(() => setBusy(""));
  };

  const joinable = (friends ?? []).filter((friend) => friend.party?.isOpen);

  const statusGroups = statusOrder
    .map((status) => ({
      status,
      label: LABELS[status],
      friends: (friends ?? []).filter((friend) => friend.status === status),
    }))
    .filter((group) => group.friends.length > 0);

  const rowProps = (friend: Friend) => ({
    connection,
    friend,
    inLobby,
    canJoin,
    invited: invited.includes(friend.puuid),
    busy:
      busy === `join-${friend.puuid}` ||
      busy === `invite-${friend.puuid}` ||
      busy === `move-${friend.puuid}`,
    disabled: busy !== "",
    onJoin: () =>
      act(
        `join-${friend.puuid}`,
        () => api.joinParty(connection, friend.party!.partyId),
        `Joined ${friend.name}'s party.`,
      ),
    onInvite: () => invite(friend),
  });

  return (
    <Card>
      <SectionTitle accent="gold">Friends</SectionTitle>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="grid place-items-center h-10 w-10 rounded-xl border border-gold/40 bg-gold/10 text-gold shrink-0">
          <Users className="h-4 w-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-ink text-sm font-semibold">
            {joinable.length > 0
              ? `${joinable.length} open ${joinable.length === 1 ? "party" : "parties"} to join`
              : inLobby
                ? "Invite friends to your lobby"
                : "Friends and parties"}
          </span>
          <span className="block text-ink-dim text-xs mt-0.5">
            {inLobby
              ? "Invite anyone idle or in a party"
              : "Join a party, or add someone by Riot ID"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-ink-dim shrink-0" />
      </button>

      <Sheet
        open={open}
        title={movingFriend ? `Move ${movingFriend.name}` : reordering ? "Reorder" : "Friends"}
        onClose={() => {
          if (movingFriend) return setMovingFriend(null);
          if (reordering) return setReordering(false);
          setOpen(false);
        }}
      >
        {movingFriend ? (
          <MoveFriendPicker
            groups={groups ?? []}
            current={movingFriend.groupId}
            busy={busy === `move-${movingFriend.puuid}`}
            onPick={(groupId) => moveFriend(movingFriend, groupId)}
          />
        ) : reordering ? (
          <div className="space-y-1.5">
            <p className="text-ink-dim text-xs leading-relaxed mb-3">
              Put the ones you check most often at the top. Saved on this device only.
            </p>
            {statusOrder.map((status, index) => (
              <div
                key={status}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] px-3.5 py-2.5"
              >
                <span className="flex-1 text-ink text-sm font-semibold">{LABELS[status]}</span>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveOrder(status, -1)}
                  className="grid place-items-center h-7 w-7 rounded-lg border border-hairline text-ink-dim disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === statusOrder.length - 1}
                  onClick={() => moveOrder(status, 1)}
                  className="grid place-items-center h-7 w-7 rounded-lg border border-hairline text-ink-dim disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setReordering(false)}
              className="w-full mt-3 rounded-xl border border-hextech/40 bg-hextech/15 py-3 text-xs font-bold uppercase tracking-wider text-hextech"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {!inLobby ? (
              <p className="text-ink-dim text-xs leading-relaxed">
                Pick a game mode first and you can invite friends into that lobby from here.
              </p>
            ) : (
              friends !== null &&
              !friends.some((friend) => INVITABLE.includes(friend.status)) && (
                <p className="text-ink-dim text-xs leading-relaxed">
                  Nobody is free to invite right now — an invite only reaches a friend who is idle or
                  in a party, not one already in a game or in champion select.
                </p>
              )
            )}

            <div>
              <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-ink-dim mb-2.5">
                Add a friend
              </h3>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2.5">
                  <UserPlus className="h-3.5 w-3.5 text-ink-dim shrink-0" />
                  <input
                    value={riotId}
                    onChange={(event) => setRiotId(event.target.value)}
                    placeholder="Name#TAG"
                    autoCapitalize="off"
                    className="min-w-0 flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-dim/60"
                  />
                </div>
                <button
                  type="button"
                  disabled={!riotId.includes("#") || busy !== ""}
                  onClick={() =>
                    act(
                      "add",
                      () => api.addFriend(connection, riotId),
                      "Friend request sent.",
                      false,
                    )
                  }
                  className="shrink-0 rounded-xl border border-gold/40 bg-gold/15 px-4 text-xs font-bold uppercase tracking-wider text-gold disabled:opacity-40"
                >
                  {busy === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                </button>
              </div>
              <p className="text-ink-dim/70 text-[11px] mt-1.5">
                Their full Riot ID, including the tag after the #.
              </p>
            </div>

            <div className="flex gap-1 rounded-xl border border-hairline bg-white/[0.03] p-1">
              {(["status", "groups"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    view === v ? "bg-hextech/15 text-hextech" : "text-ink-dim hover:text-ink-muted"
                  }`}
                >
                  {v === "status" ? "By status" : "By group"}
                </button>
              ))}
            </div>

            {view === "status" ? (
              friends === null ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-hextech" />
                </div>
              ) : (
                <>
                  {statusGroups.length === 0 && (
                    <p className="text-ink-dim text-sm py-4 text-center">No friends to show.</p>
                  )}

                  {statusGroups.map((group, i) => {
                    const collapsed = group.status === "offline" && !showOffline;
                    return (
                      <div key={group.status}>
                        <div className="flex items-center justify-between mb-2.5">
                          <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-ink-dim">
                            {group.label} · {group.friends.length}
                          </h3>
                          <div className="flex items-center gap-3">
                            {group.status === "offline" && (
                              <button
                                type="button"
                                onClick={() => setShowOffline((current) => !current)}
                                className="text-[10px] font-bold uppercase tracking-wider text-ink-dim hover:text-ink-muted"
                              >
                                {showOffline ? "Hide" : "Show"}
                              </button>
                            )}
                            {i === 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setReordering(true)}
                                  title="Reorder these groups"
                                  className="text-ink-dim hover:text-hextech"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={loadFriends}
                                  title="Refresh"
                                  className="text-ink-dim hover:text-hextech"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {!collapsed && (
                          <>
                            <div className="space-y-1.5">
                              {group.friends.slice(0, CAP).map((friend) => (
                                <FriendRow key={friend.puuid} {...rowProps(friend)} />
                              ))}
                            </div>
                            {group.friends.length > CAP && (
                              <p className="text-ink-dim/70 text-[11px] mt-2">
                                …and {group.friends.length - CAP} more.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              )
            ) : friends === null || groups === null ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-hextech" />
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2.5">
                    <Plus className="h-3.5 w-3.5 text-ink-dim shrink-0" />
                    <input
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      placeholder="New group name"
                      className="min-w-0 flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-dim/60"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!newGroupName.trim() || busy !== ""}
                    onClick={createGroup}
                    className="shrink-0 rounded-xl border border-gold/40 bg-gold/15 px-4 text-xs font-bold uppercase tracking-wider text-gold disabled:opacity-40"
                  >
                    {busy === "create-group" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Create"
                    )}
                  </button>
                </div>

                {groups.map((group) => {
                  const members = friends.filter((friend) => friend.groupId === group.id);
                  const isDefault = group.id === 0;
                  const editing = editingGroup?.id === group.id;

                  return (
                    <div key={group.id}>
                      <div className="flex items-center justify-between mb-2.5 gap-2">
                        {editing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              value={editingGroup.name}
                              onChange={(event) =>
                                setEditingGroup({ id: group.id, name: event.target.value })
                              }
                              autoFocus
                              className="min-w-0 flex-1 rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink outline-none focus:border-hextech/50"
                            />
                            <button
                              type="button"
                              onClick={() => renameGroup(group.id)}
                              className="text-hextech"
                            >
                              {busy === `rename-${group.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingGroup(null)}
                              className="text-ink-dim"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-ink-dim">
                              {group.name} · {members.length}
                            </h3>
                            {!isDefault &&
                              (confirmDelete === group.id ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => deleteGroup(group)}
                                    className="text-[10px] font-bold uppercase tracking-wider text-danger"
                                  >
                                    {busy === `delete-${group.id}` ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      "Confirm"
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDelete(null)}
                                    className="text-[10px] uppercase tracking-wider text-ink-dim"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3 text-ink-dim">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingGroup({ id: group.id, name: group.name })
                                    }
                                    title="Rename"
                                    className="hover:text-hextech"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDelete(group.id)}
                                    title="Delete"
                                    className="hover:text-danger"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                          </>
                        )}
                      </div>

                      {members.length === 0 ? (
                        <p className="text-ink-dim/70 text-xs pb-2">Nobody here yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {members.slice(0, CAP).map((friend) => (
                            <FriendRow
                              key={friend.puuid}
                              {...rowProps(friend)}
                              onMove={() => setMovingFriend(friend)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </Sheet>
    </Card>
  );
}

/** The list of groups to move a friend into, shown as its own screen. */
function MoveFriendPicker({
  groups,
  current,
  busy,
  onPick,
}: {
  groups: FriendGroup[];
  current: number;
  busy: boolean;
  onPick: (groupId: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          disabled={busy || group.id === current}
          onClick={() => onPick(group.id)}
          className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-60 ${
            group.id === current
              ? "border-hextech/50 bg-hextech/10"
              : "border-hairline bg-white/[0.03] hover:border-hextech/30"
          }`}
        >
          <span className="flex-1 text-ink text-sm font-semibold">{group.name}</span>
          {group.id === current && (
            <span className="text-hextech text-[10px] font-bold uppercase tracking-wider">
              Current
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * One friend, with at most one primary action plus, in the Groups view, a
 * secondary Move.
 *
 * An open party is worth joining, so that wins when it is on offer. Otherwise the
 * useful thing is pulling them into our lobby — which the client allows even when
 * they are sitting in a closed party of their own.
 */
function FriendRow({
  connection,
  friend,
  inLobby,
  canJoin,
  invited,
  busy,
  disabled,
  onJoin,
  onInvite,
  onMove,
}: {
  connection: Connection;
  friend: Friend;
  inLobby: boolean;
  canJoin: boolean;
  invited: boolean;
  busy: boolean;
  disabled: boolean;
  onJoin: () => void;
  onInvite: () => void;
  /** Present only in the Groups view — opens the move-to-group picker. */
  onMove?: () => void;
}) {
  const party = friend.party;
  const showJoin = Boolean(party?.isOpen);
  const showInvite = inLobby && INVITABLE.includes(friend.status);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-hairline bg-white/[0.03] px-3.5 py-2.5">
      <img
        src={profileIconUrl(connection, friend.profileIconId)}
        alt=""
        loading="lazy"
        className="h-8 w-8 rounded-full border border-hairline shrink-0"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-ink text-sm font-semibold truncate">{friend.name}</span>
        <span className="block text-ink-dim text-xs mt-0.5 truncate">
          {party
            ? `${party.queueName || `Queue ${party.queueId}`} · ${party.players}/${party.maxPlayers}`
            : /* Their mode, when the client is telling us one — far more use than
                 a chat status that reads "dnd" for everyone mid-game. */
              friend.queueName || friend.statusMessage || friend.availability}
        </span>
      </span>

      {showJoin ? (
        <button
          type="button"
          disabled={disabled || !canJoin}
          onClick={onJoin}
          className="shrink-0 rounded-lg border border-hextech/40 bg-hextech/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-hextech disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Join"}
        </button>
      ) : showInvite ? (
        <button
          type="button"
          disabled={disabled || invited}
          onClick={onInvite}
          title={`Invite ${friend.name} to your lobby`}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
            invited ? "border-hairline text-ink-dim" : "border-gold/40 bg-gold/15 text-gold"
          }`}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : invited ? (
            "Invited"
          ) : (
            <>
              <Send className="h-3 w-3" />
              Invite
            </>
          )}
        </button>
      ) : null}

      {onMove && (
        <button
          type="button"
          disabled={disabled}
          onClick={onMove}
          title={`Move ${friend.name} to a different group`}
          className="shrink-0 grid place-items-center h-7 w-7 rounded-lg border border-hairline text-ink-dim hover:text-hextech disabled:opacity-40"
        >
          <FolderInput className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
