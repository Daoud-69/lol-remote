# LoL Remote

Control League of Legends champion select from your phone — accept the ready check, pick or ban a
champion, and choose your skin, without touching the keyboard.

### Download

| | |
|---|---|
| **[⬇ Windows agent](https://github.com/Daoud-69/lol-remote/releases/latest/download/LoLRemoteAgent-Setup.exe)** | Runs on your gaming PC. This is the half that talks to League. |
| **[⬇ Android app](https://github.com/Daoud-69/lol-remote/releases/latest/download/LoLRemote.apk)** | The remote itself. Optional — see below. |

Install the agent and open it. It shows a QR code — point your phone's camera at it and the remote
opens already paired, with nothing to type. The address and six-digit code are there beside it for
anyone who'd rather type them, or who's using the Android app (which scans the same QR from its own
connect screen). Both are the same remote; the app just gets its own icon and loses the address bar.

**iPhone:** open the address in Safari and use Share → *Add to Home Screen*. It launches fullscreen
with a proper icon, which is as close to an installed app as iOS allows without a paid Apple
developer account.

Neither download needs the source. Clone the repo only if you want to build it yourself.

## What it does

**From the phone, live:**
- **The whole play menu** — PvP, Co-op vs. AI, Training, Create Custom and Join Custom, the same five
  tabs the client has. Pick ARAM, Draft, Ranked, Arena, TFT, Swiftplay or whatever is rotating this
  month; open Practice Tool; stand up a custom lobby with a name, team size, password and spectator
  policy; or browse and join a public custom game. The list is read from the client itself, so a mode
  added after you installed this still shows up
- **Friends and parties** — the list grouped by status (in game, online, champion select, in a party,
  Riot Mobile, other Riot games, offline) with that order reorderable to taste, or grouped by the
  client's own friend groups with create, rename, delete and drag-free move-between. Each friend shows
  the mode they are actually in. Join a party when its owner left it open, invite friends into a lobby
  you made, and add somebody by Riot ID
- Accept / decline the ready check (full-screen takeover + vibration + push notification)
- Pick your two lobby roles — the same selector the client shows, driven from the phone
- Pick and ban by tapping — a champion you tap is hovered in the client straight away, so the team
  sees it without a second press. Locking keeps a button of its own, being the half you cannot take
  back
- **Both teams on one board** — your side with the roles the client assigned, the enemy side named
  as they commit, and the bans split into yours and theirs rather than pooled into one row. A
  hovered champion is drawn faded and a locked one solid: an enemy still hovering your counter is a
  different situation from one who has committed to it
- Set both summoner spells
- Pick a skin once you're locked in (owned skins selectable, locked ones shown greyed)
- **Swap roles or pick order with a teammate** — ask whoever you want, and answer the ones they ask
  you with Accept or Decline. Incoming requests sit above everything, because they are the half
  that expires
- Swap from the ARAM/Swiftplay bench
- Start and stop matchmaking, and leave the lobby again

**Automation, for when you're not looking at the phone either:**
- Auto-accept, with an optional delay so you can still decline
- **A pick list per role**, tried in order — your second and third choices cover the case where
  someone bans or takes your first. Because the list is chosen by the role the client *actually*
  assigned, an autofill picks from that role's list instead of stranding you on your main.
- **Declare your pick in the planning phase**, so the team sees your champion before bans start
- An ordered ban list, which skips anything a teammate has already declared
- Preset summoner spells, globally or per role
- **A rune page per champion** — build one in the app, or load one of the client's own
  recommendations for that champion and role. Applied automatically when you lock in. Champions
  you never got around to setting up fall back to a **rune source**, so locking a champion with no
  page saved still gets sensible runes instead of nothing
- **Panic lock** — commits whatever is hovered a few seconds before the timer expires, so a phone
  that loses signal mid-select doesn't leave you with a random champion

**A note on rune pages.** Accounts have a hard cap on how many rune pages they can hold, so
"a page per champion" isn't something the client can store. Instead the agent keeps exactly one
page of its own, named `LoL Remote — <champion>`, and rewrites it each time you lock in. Pages you
made yourself are never touched. If your account is at its cap and the agent has no page of its
own yet, it says so and does nothing rather than deleting one of yours to make room — free a slot
in the client once, and it will reuse that slot from then on.

**Rune sources.** A page you saved for a champion always wins. The source is what answers for the
champions you never configured, which is most of them for most people — without one, "apply runes
on lock" did nothing at all unless you had already done the setup work. The only source that ships
is the client's own recommendation for that champion and the role it assigned you, which costs
nothing and needs no account anywhere.

It is written as an interface (`agent/src/runeSource.ts`) rather than a direct call, because the
client's recommendation is the first source that made sense, not the only one. What Blitz and
Porofessor actually sell is a *different source* — pages derived from the win rates of millions of
ranked games — and that is the same shape: champion and role in, a page out. Adding one is writing
a `RuneSource` and listing it in `RUNE_SOURCES`; nothing above that file knows which kind it is
talking to, and the phone's picker lists whatever the agent advertises rather than a copy of the
list that would drift from it. Note that none of those sites publish an API for this — their
numbers come out of undocumented endpoints their own overlays call, which is a licensing question
before it is a technical one, and why this ships with the source that is simply Riot's own.

A page from a source is checked before it is written: two distinct styles, exactly nine perks, all
positive ids. The client's own recommendations are well-formed, but somebody else's JSON can change
shape without warning, and the failure to avoid is half a page overwriting the one slot the agent
owns.

## Setup

### 1. Agent (on the gaming PC)

**[`desktop/`](desktop) is the app to install** — a proper Windows program with its own window: a
pairing QR code with the address and pairing code beside it, live League-client status, a
connected-phone indicator, and an activity feed, styled to match the [`web/`](web) remote control.
Minimizes to the tray instead of quitting, so closing the window doesn't drop your phone's
connection.

If the PC has more than one network address — Ethernet and Wi-Fi, or a VM's virtual adapter — they
are all listed and you can tap one to point the QR at it. Only you know which network the phone is
actually on.

It also serves the [`web/`](web) remote control itself, from the same address it already shows —
open that link in your phone's browser and you get the actual app UI, no separate server to start,
no app install needed. The address doubles as both the API endpoint and the web app's URL.

Most people should just take the [download](#download) above. To build it yourself:

```bash
cd desktop
npm install
npm run package:installer
```

Produces `desktop/build/dist/LoLRemoteAgent-Setup.exe`. Running it installs like any other
Windows app — Start Menu / desktop shortcut, an optional Windows Firewall rule (covers every network
profile, so a Wi-Fi/Ethernet connection Windows happens to classify as "Public" won't silently block
your phone), an optional "start with Windows" shortcut, and a proper uninstaller. `package:installer`
builds `web/` first and bundles it in as a resource, so the phone-facing web app ships inside the
installer with no extra step. The compiler binaries ship inside the `electron-builder` npm package,
so nothing extra needs installing on the build machine.

**Windows will warn you before you can run it.** The first time you open the downloaded installer,
you'll see a blue "Windows protected your PC" screen from Microsoft Defender SmartScreen. That's not
a virus warning — it's what Windows shows for *any* new app from a developer who hasn't paid for a
code-signing certificate (hundreds of dollars a year), regardless of what the app actually does.
Click **More info**, then **Run anyway**. The full source is in this repo if you'd rather check what
it does yourself before trusting it.

**Running from source, for development:**

```bash
cd agent
npm install
npm run dev
```

This prints the same pairing banner to the terminal and runs the identical server code the
`desktop/` app imports — useful for iterating on `agent/src` without rebuilding the whole Electron
app each time, but it's a developer workflow, not something to hand to a friend.

### 2. Phone

Whichever of these you pick, it is the same remote and the same requirement: the phone on the same
Wi-Fi as the PC. The connection is remembered, so pairing happens once.

**Nothing at all.** Point your phone's camera at the QR code in the agent window and open the
notification it offers. That is the whole setup — the link carries the address and the pairing code,
so the remote opens already connected. Typing the address into a browser by hand still works, and
then it asks for the code.

**Android app.** Install the [APK](#download) and tap **Scan the QR code** on its connect screen.
Own icon, no address bar. A camera app can't hand a link to an installed app, so the app does its
own scanning — same QR, same result. It is [`web/`](web) wrapped by Capacitor, so it is the same UI
with the same features — built with:

```bash
cd web
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK is a *debug* build. It is signed with Android's debug key, which is fine for sideloading
onto your own phone but is why Android warns about the source; shipping through a store would need
a release keystore.

**iPhone.** Scan the QR with the camera to open it in Safari, then Share → *Add to Home Screen*.
The pairing code is dropped from the address bar once it has been used, so the shortcut you save is
the clean URL and the code is not left sitting in your history. Apple honours the `apple-mobile-web-app` tags
over plain HTTP, so it launches fullscreen with a real icon. A true native iOS build needs macOS
and an Apple signing identity; the Capacitor project is scaffolded in [`web/ios`](web/ios) for
whenever that exists, but it has never been built.

**Watch the address.** Your router hands it out over DHCP, so it can change when the PC reboots and
a home-screen shortcut would then point nowhere. The agent window always shows the current one;
reserving a fixed address for the PC in your router makes it permanent.

**The Expo client is optional and behind.** [`app/`](app) is an older, hand-written native client.
It has **not** been updated for role presets, backup picks or runes, and its auto-pick / auto-ban
controls write settings the agent no longer reads. The Android app above supersedes it. Scaffolded
on **Expo SDK 57** with dependencies resolved:

```bash
cd app
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone (same Wi-Fi as the PC), then enter the IP, port and
pairing code from the agent window.

### 3. Push notifications (optional but recommended)

Without this you still get vibration and a full-screen alert *while the app is open*. With it, your
phone buzzes even with the app closed.

The agent sends the push itself via Expo's service (it has internet even though the phone only
reaches it over LAN), so no relay server is needed. It just needs a token, which the app registers
automatically on connect.

- **Android:** works in Expo Go as-is.
- **iOS:** Expo Go dropped remote push support in SDK 53. You need a development build:
  ```bash
  npx eas build --profile development --platform ios
  ```
  and an EAS project id filled into `extra.eas.projectId` in `app.json`.

Note this is the [`app/`](app) Expo client's path only — the Android app and the browser get the
vibration and the full-screen alert, not a push.

## Project layout

```
agent/src/
  index.ts              Entry point, prints the pairing banner and a terminal QR
  config.ts             Pairing code and link, saved automation settings, push tokens (~/.lol-remote)
  session.ts            Owns the client connection, live state, automation rules
  server.ts             REST + WebSocket the phone talks to
  push.ts               Expo push sender
  runeSource.ts         Where runes come from for a champion with no page saved
  types.ts              The agent↔phone contract
  lcu/
    credentials.ts      Finds the client's port + auth token
    client.ts           HTTPS + WAMP WebSocket wrapper
    actions.ts          accept / pick / ban / spells / skin, roles, session parsing
    runes.ts            Perk catalog, the client's recommendations, writing a page
    gamedata.ts         Champion, spell and skin catalogs (served by the client itself)

web/src/                The remote your phone actually loads, served by the agent
  App.tsx               Tab shell, ready-check overlay, toasts
  lib/api.ts            Typed client for the agent
  hooks/useAgent.ts     Live WebSocket state with reconnect
  hooks/useAutomation.ts  Settings that apply on tap and reconcile with the agent
  components/panels/    Status, ChampSelect, Automation
  components/           Champion grid and slots, role picker, rune editor, skin carousel
  components/ModePicker.tsx  The play menu: five tabs, custom-lobby form, lobby browser
  components/FriendsCard.tsx  Friends: reorderable status view, client-style groups, invites
  components/QrScanner.tsx  Camera viewfinder for the installed app, lazy-loaded
web/android/            Capacitor shell — the installable Android app, same UI
web/ios/                Capacitor shell for iOS; scaffolded, never built (needs macOS)
web/public/             Icons and the web manifest that make it installable to a home screen

app/                    Second, Expo-based client — see the note under Setup; not at parity
  App.tsx               Tab shell, ready-check overlay, toasts
  src/api.ts            Typed client for the agent
  src/useAgent.ts       Live WebSocket state with reconnect
  src/screens/          Connect, Status, ChampSelect, Automation

desktop/src/            Electron shell around agent/src — the app to actually install, see above
  main/index.ts          Starts the same Session + startServer as agent/'s dev entry, plus tray/window/IPC
  preload/index.ts        contextBridge API the renderer calls into
  renderer/src/          Pairing code, status, and activity feed UI (styled to match web/)
desktop/build/          electron-builder inputs: the app icon and the NSIS install script
```

## How the interesting parts work

**Architecture.**

```
Phone (browser)  ──HTTP + WebSocket──▶  Agent (Node, on your PC)  ──▶  League Client API
       ▲                                        │
       └────────── Expo push ───────────────────┘   "Queue popped!"
```

The agent talks to the **LCU** (League Client Update) API — the same local HTTPS API the client's
own UI uses. It reads the port and auth token from the running `LeagueClientUx.exe` process, so
there's nothing to configure.

**Picking a mode.** The client has no "mode" setting — there is only which lobby you are sitting
in, so choosing a mode means `POST /lol-lobby/v2/lobby` with a queue id. The list of modes comes
from `/lol-game-queues/v1/queues` on every request rather than being baked in here, which is the
only way this keeps working: Riot rotates modes constantly. Checked against a live client, that
endpoint returned 88 rows, of which 17 survive filtering — the rest are retired events, hidden
internal rows and customs, which are created through a different call entirely.

Four of those 17 carried `gameMode` values that did not exist when this was written (`SWIFTPLAY`,
`KIWI`, `KIWI_JADE`, `JADE`), which is the whole point: an unrecognised mode still appears and is
still playable, it just lands under "Other modes" instead of getting its own heading. Grouping is
the only thing decided locally; availability is always the client's answer.

The picker mirrors the client's play menu, and both of its levels come from the client rather than
from anything written down here. The tab is whether the queue is played against bots; the heading
beneath it is the map's `gameModeName` from `/lol-maps/v2/maps`. That is why Swiftplay files itself
under Summoner's Rift, why the rotating Mayhem codenames (`KIWI`, `KIWI_JADE`) file themselves under
ARAM, and why `mapId 453` comes out as "Classic Rift" — none of those names appear in the source.
Use `gameModeName` and not `name`, incidentally: for the Howling Abyss, `name` is "Random Map" while
`gameModeName` is "ARAM".

**Three traps in this data, every one of which shipped a bug before being found.**

First, `category` does not identify bot games. Classic Rift ships as two queues that are identical
in name (`Classic`), `gameMode` (`JADE`) and `mapId` (453) — 4310 is `JADE_RANKED_SOLO_5x5`
("Classic 5v5") and 4320 is `JADE_BOT` ("Classic Co-op vs. AI") — and the API reports **both** as
`category: "PvP"`, even though the client itself files the second under Co-op vs. AI. The `type` is
the only field that separates them, so bot detection reads that. Trusting the category put a bot
queue in the PvP tab, where tapping "Classic" started a co-op match.

Second, `isRanked` over-reports. The client sets it `true` on 4310, which its own UI does not
present as ranked — the type inherits "RANKED_SOLO_5x5" from the ruleset the mode is built on rather
than from being ranked. Genuinely ranked queues have a type *starting* with `RANKED_`, while
mode-specific variants carry a prefix, so both are required. The bias is deliberately towards
under-badging: a missing badge is a cosmetic miss, whereas labelling a casual queue "Ranked" lies
about what you are about to queue into.

Third, do not deduplicate. An earlier version collapsed queues sharing a `gameMode` and name,
which looked reasonable and quietly dropped one of those two Classic queues — keeping whichever came
first in the client's list, which was the bot one. Queue ids are already unique; distinct ids are
distinct modes, and there is nothing to merge.

One wrinkle worth stating: queue 400 is named "Normal" and only its *description* says "Draft Pick",
so the list shows a description whenever it differs from the name and hides it when it merely
repeats it. Without that, draft is not findable by eye.

The mode you are in is reported by name, not id, including for lobbies the picker deliberately
hides — sitting in a Practice Tool lobby reads as "Multiplayer Practice Tool Custom" rather than
"Queue 3140". The agent caches the id-to-name map once per connection, since modes only change when
the client restarts.

**Custom lobbies, Practice Tool included.** These are the one thing a queue id alone cannot start.
The client models them as a `customGameLobby` configuration — map, mode, team size, name, password,
spectator policy — but the configuration on its own is refused: `INVALID_LOBBY` for Practice Tool and
a bare 400 for the rest. The queue id has to travel **alongside** it, and once it does everything
works. The id is also what the client treats as authoritative: asking for 3140 with `gameMode:
"CLASSIC"` still produced a `PRACTICETOOL` lobby.

That is why the presets configure themselves. Each Custom-category queue already carries the map, the
mode and its pick rules, so "SR Draft Pick Custom" needs nothing from this codebase beyond the name
and team size you choose — and a draft custom comes back with `showPositionSelector` true, so the
role picker appears for it and not for a blind one.

**Joining a public custom.** The browser lives at `/lol-lobby/v1/custom-games`. Watch the
identifier: every row comes back with `id: 0`, and `partyId` is the only thing that distinguishes one
lobby from another — 100 rows, 100 distinct party ids, one distinct `id`. Joining therefore goes
through `POST /lol-lobby/v2/party/{partyId}/join`; the obvious-looking
`/lol-lobby/v1/custom-games/{id}/join` wants a uint64 and is useless with an id that is always zero.

**Friends and their parties.** `/lol-chat/v1/friends` is the list, and each friend's party arrives
as a JSON *string* inside `lol.pty` — presence data rather than a typed field, so it is parsed
defensively: a malformed payload should cost that one friend their party badge, not take the list
down. The field that matters inside it is `isPartyOpen`. Only an open party can be joined without an
invite, and joining goes through the same `POST /lol-lobby/v2/party/{partyId}/join` the custom-game
browser uses — a friend's party and a public custom are the same thing to the client.

Closed parties are still listed, marked "Invite only" rather than hidden. On a real friends list most
parties are closed — 184 friends, 26 online, 3 in a party and none of them open, the first time this
was run — so filtering them out leaves a blank panel that reads as broken when the honest answer is
"they are playing, you just need an invite".

**Adding a friend** takes two calls, because the chat service wants a puuid and nobody knows their
friends by puuid: `POST /lol-summoner/v1/summoners/aliases` turns `Name#TAG` into an account, then
`POST /lol-chat/v2/friend-requests` with `{ puuid, direction: "out" }`. Worth noting that the
request body decides whether that route is even recognised — posting `{ gameName, tagLine }` to it
answers `405 WRONG_METHOD`, which looks like the wrong verb and is not.

**Working out where a friend is.** No single field says it, and the obvious one is a trap.
`availability` is a *chat* status — it reads `dnd` for everybody in a game, which tells you nothing
about whether they are playing. The real game state is `lol.gameStatus` (`inGame`,
`championSelect`, `outOfGame`), which is what the client's own list reads, and `product` says whether
they are even on League. The agent resolves all three into one status so both clients group the same
way. Measured against a live list: 159 offline, 13 in game, 8 on the mobile app, 2 idle, 1 in champion
select, 1 in VALORANT.

Two details that bite. The mobile app reports **no** game status at all, so it has to be matched
before anything that reads `gameStatus`. And `lol.queueId` arrives as the **string** `"420"` while the
queue-name cache is keyed by number — so every friend's mode rendered as "Queue 420" until it was
coerced, a miss that fails silently rather than throwing.

Offline is drawn last and collapsed. Most of a real list is offline, and rendering all of it buries
everyone you could actually play with.

**Reordering the status buckets.** Which comes first — "In game" or "Online" — is a preference with
no correct default, so it lives in `localStorage` on the phone rather than in the agent: two people
sharing one PC can each keep their own order. The saved order is repaired against the known statuses
on load rather than trusted outright, so a status that did not exist when someone last saved their
order still appears, appended in the default place.

**The client's own friend groups.** Read and managed directly through `/lol-chat/v1/friend-groups`
(list, create, rename, delete) and `PUT /lol-chat/v1/friends/{id}` (move). The default bucket ships
under the literal name `**Default` — a placeholder the client localises on screen — so it is relabelled
"Ungrouped" here rather than shown verbatim.

One real trap in the move route: `GET /lol-chat/v1/friends/{puuid}` answers `404 Friend Not Found`.
The path segment the route actually wants is the friend's `id` field, which is the puuid with the
platform appended (`<puuid>@eu1.pvp.net`), and that is only available from the list endpoint — so a
move looks the friend up there first rather than addressing them by the id the rest of this API uses
everywhere else. The route also takes a whole friend resource rather than a patch, so the record is
read back and returned with only `groupId` changed; sending a partial object would blank out
everything left off it, including a note written about them.

Deleting a group was verified to relocate its members to Ungrouped automatically rather than orphaning
them, which is why the delete route needs no migration step of its own — the client already does it.

**One thing this does not attempt.** The client also exposes `PUT /lol-chat/v1/friend-groups/order`
for reordering someone's own groups (Ungrouped vs. a custom one), and testing the create/delete cycle
shifted that order once as a side effect — no friends moved, nothing renamed, just the two groups'
relative position on the client's own list swapped. Several request shapes were tried against that
endpoint to restore it programmatically; all either failed outright or returned success with no visible
effect, and guessing further risked compounding the change rather than fixing it. It was left alone —
trivially fixable by hand, since the client's own social panel reorders groups by dragging — and no UI
here calls that route, so this feature will not reproduce the swap.
**Inviting friends into your lobby.** `POST /lol-lobby/v2/lobby/invitations` takes an array, so
several people go out in one call, and each entry may identify its target by either `toSummonerId` or
`toPuuid` — puuid, since that is what the friends list already hands over. The agent refuses when
there is no lobby rather than passing that case to the client, whose own error for it says nothing
useful, and it re-reads the lobby rather than trusting its cached copy so a missed event cannot slip
past that check.

An invite only reaches a friend who is **idle or in a party of their own**. It does not reach one
who is mid-game or in champion select, is not deliverable to the Riot Mobile app, and obviously not to
anyone offline — so the button is only offered for the two statuses that can receive it. A friend
whose party is *open* gets Join instead, which is the more useful of the two.

Note there is deliberately no "join by invite link" here. The client's own link is
`https://gg.riotgames.com/LOL?joinCode=…`, and nothing local can redeem one: of the client's six join
functions, the three that mention a code all take an *activity* id and **return** a code, and none
accepts one as input. Inviting solves the same problem from the other end — you pull people into your
lobby instead of them pushing a link at you.

**Pairing by QR.** The code encodes one string — `http://<address>:8777/?code=123456` — and that one
string covers both routes, because it is the URL the remote is *already* served from with the
pairing code attached. A phone camera treats it as an ordinary link and opens the remote, which
reads the code out of its own address bar and connects before drawing anything. The installed app
can't be reached by a link, so it scans the same code itself (`getUserMedia` plus `jsqr`) and parses
that string back into a host, port and code. Same payload, one definition of it in
`agent/src/config.ts`, and no second format to keep in sync.

Two details worth knowing. The QR is drawn dark-on-white even though the agent window is nearly
black — an inverted code is a coin flip on whether a given phone camera reads it, and one that only
sometimes scans is worse than none. And the scanner only exists in the app: `getUserMedia` is
exposed only on secure origins, which Capacitor's `http://localhost` is and this same page loaded
from the agent over plain HTTP is not, so the browser build hides the button rather than offering a
camera that cannot open. That costs nothing, because the browser route never needed it.

Once a link has been used the code is stripped from the address bar with `replaceState`, so it does
not linger in history or in a saved home-screen shortcut. A link in the address bar also outranks a
remembered connection — re-scanning after regenerating the code is how you'd fix a phone stuck on
the old one, and silently restoring the stale connection would defeat that.

**Finding the client.** `credentials.ts` queries `Win32_Process` for `LeagueClientUx.exe` and pulls
`--app-port` and `--remoting-auth-token` off its command line, falling back to the `lockfile` in the
install directory. Auth is HTTP Basic with username `riot`. The client's certificate is self-signed,
so TLS verification is off — acceptable because the target is a loopback socket whose credentials we
just read from the local process table.

**Live state.** The agent opens a WAMP WebSocket to the client and subscribes to gameflow phase,
ready check, and champ select session events. Everything is push-driven; there's no polling.

**Whose turn it is.** Champ select actions arrive as an array of phases, each containing every
player's action. `findMyAction` flattens them and finds the one where `actorCellId` matches
`localPlayerCellId` and `isInProgress` is true. The phone never sends an action id — it sends a
champion, and the agent resolves the current action itself, so a stale phone can't lock into the
wrong slot.

**Reading both teams' bans.** The session carries a `bans` object split into `myTeamBans` and
`theirTeamBans`, which is the obvious source and is not the only one: every completed ban is also
sitting in the `actions` array, where `isAllyAction` says whose it was. The two are unioned rather
than one being a fallback for the other, so a side the client leaves empty still fills in without
this having to know which of them it decided to populate. A champion can only be banned once per
game, so a ban already recorded on either side is the same ban seen twice rather than a second one
— which is what makes the union safe to do blindly.

The enemy team itself needs no such care: `theirTeam` carries their locked champions and arrives
with the rest of the session. Their `assignedPosition` is empty, though — roles are never revealed
— which is why the phone captions those slots with the champion's name instead. Modes that hide the
enemy team outright send an empty array, and the board simply omits that half.

**Swapping roles and pick order.** Two features in the client, one shape here: the session carries
`positionSwaps` and `pickOrderSwaps`, each a list of `{ id, cellId, state }` — one entry per
teammate you could trade with — and both are driven by the same four verbs,
`POST /lol-champ-select/v1/session/{position-swaps,pick-order-swaps}/{id}/{request,accept,decline,cancel}`.
The id identifies the teammate and the kind together, so none of those calls carries a body. That
is why the agent flattens both lists into one with a `kind` tag and exposes a single `/api/swap`
rather than eight routes that would differ only in a path segment.

`state` is what makes it legible, and only three of its eight values are worth a button:
`AVAILABLE` is an offer you could make, `SENT` one you are waiting on, and `RECEIVED` a teammate
asking *you*. The rest are either settled (`ACCEPTED`, `DECLINED`, `CANCELLED`) or not offerable
(`BUSY` while that player is mid-swap with someone else, `INVALID` where the trade makes no sense).
All eight are passed through to the phone rather than filtered in the agent, so an unrecognised
state degrades to "not offerable" instead of vanishing.

The agent checks that a swap is one the client is currently offering before forwarding the call.
A phone that has been asleep can otherwise accept a request that has already expired, and the
client's own error for that is not something worth showing anybody.

**Which champion to pick.** The agent reads `assignedPosition` off its own slot in `myTeam` and
takes the first entry from that role's list that nobody has banned or locked. Autofill needs no
special case: the role the client assigned *is* the lookup key, so being handed support instead of
mid simply reads a different list. Bans work the same way, minus anything a teammate has declared
via `championPickIntent`.

**Why the client's own availability lists are only a hint.** `pickable-champion-ids` and
`bannable-champion-ids` look authoritative and are not. For roughly the first half-minute after
the ban phase opens they come back *populated but incomplete*, omitting champions the client will
accept perfectly well seconds later. Treating them as a veto meant sitting out the first ban of
every game. So the agent prefers a champion they advertise, and otherwise offers its first untaken
choice and lets the client be the one to refuse. A refusal is retried a few times rather than
being final — the client also rejects actions for a beat around phase boundaries — and only a call
it accepts closes the turn out.

**Declaring a pick.** During `PLANNING` the champion you intend to play is declared by patching
your *pick action* with `completed: false` — the same call a hover uses, which is exactly why it
shows up for the team. It commits nothing.

The obvious-looking alternative does not work: `PATCH /lol-champ-select/v1/session/my-selection`
with a `championId` is accepted and returns success, but it only updates your local selection
record and never tells the lobby, so every slot stays empty and nothing appears on screen. A
silent no-op that reports success is worse than an error, so it is worth stating plainly. Note
also that the pick action is *not* the one in progress during planning — the first ban is — so it
travels in the session state separately from `myAction`.

**Runes.** `/lol-perks/v1/styles` gives the tree structure (a keystone slot, three minor slots and
three stat slots per tree) and `/lol-perks/v1/perks` the individual runes, which is everything the
editor needs to render offline. `/lol-perks/v1/recommended-pages/champion/{id}/position/{pos}/map/11`
returns the client's own suggestions in exactly the shape a page is written in. One wrinkle worth
knowing: a page is `primaryStyleId` plus `subStyleId` — the secondary tree is called `subStyleId`
on both read and write, even though the same object also carries a `secondaryStyleName`.

**Skins.** `PATCH /lol-champ-select/v1/session/my-selection` with `selectedSkinId`. The client only
honours it after your pick is locked, which is why the skin tab tells you to lock in first.

## Security

The agent binds to `0.0.0.0` so your phone can reach it, and gates every endpoint behind a six-digit
pairing code stored in `~/.lol-remote/config.json`. That's appropriate for a home network — it stops
a roommate poking at it, not a determined attacker on your LAN. Don't run this on public Wi-Fi. To
rotate the code, delete `~/.lol-remote/config.json` and restart the agent.

## A note on Riot's ToS

Riot's Terms of Service prohibit third-party software that automates gameplay. This tool only calls
the League *client's* own API — the same endpoints its UI uses — and never touches the game process,
reads memory, or automates anything in a live match. Auto-accept and champ-select helpers have been
widely used for years (Blitz, Porofessor, and dozens of open-source auto-accepters) without
enforcement action, but Riot has never formally blessed them. Use it knowing that.

## What's been verified

Tested end to end on macOS against a **running agent with no League client**, which exercises
everything except the LCU calls themselves:

- Every package typechecks clean (agent on TS 5.7, web and desktop on TS 6 / React 19)
- Agent discovers credentials, serves the pairing banner, and reconnects while waiting for League
- REST auth gate: correct code passes, wrong code gets `401`
- WebSocket: pushes state on connect, rejects a bad pairing code at the upgrade
- Automation settings round-trip through the API and persist to `~/.lol-remote/config.json`
- Champ-select parsing covered by fixtures — ban turn vs. pick turn, teammates' actions correctly
  ignored, completed actions, ARAM bench, and malformed sessions
- App bundles for iOS (812 modules) and web (347 modules), zero console errors
- Full connect flow drives the live agent and streams its activity log in real time
- The `desktop/` Electron build launched against a **live League client mid-match** and correctly
  reported "Connected to the League client" in its status card and activity log

Since verified on Windows against a **live League client**, in a real ranked lobby and queue:

- Auto-accept fired on a real queue pop, preset spells applied, and the auto-ban locked
- Role preferences round-trip: `POST /api/positions` writes the lobby's selector, the client
  reflects it, and the lobby event reconciles agent state (Mid/Top, Fill, and back to Jungle/Support)
- Role presets and backup picks persist through the API to `~/.lol-remote/config.json`, and old
  single-champion configs migrate into the new lists on first read
- Rune catalog (5 styles × 7 slots, 69 selectable perks), the player's saved pages, and the
  client's per-champion recommendations all serve to the phone
- The rune writer refuses safely on a full account: it declines with a readable message and leaves
  every player-made page untouched, and rejects a page that isn't exactly 9 perks
- The rune source resolves and validates against a **live client**: the client's recommendation for
  Viego jungle, Ahri mid, Darius top, Jinx bot, Thresh support and a role-less (ARAM-style) request
  all came back as usable nine-perk pages, and each one checks out against the perk catalog —
  keystone in the primary tree, minors in the tree they belong to, three real stat shards, and the
  two trees distinct (Precision/Inspiration Conqueror for Viego, Resolve/Inspiration Guardian for
  Thresh). The guard rejects an eight-perk page, a zero style id and a zero perk id, and an
  unknown source id degrades to "leave it alone" rather than throwing
- Tap-to-hover and the rune source both driven for real from a phone in a **live Practice Tool**
  champ select: tapping a champion put it on the slot with no second press, and the runes applied
  on lock. Practice Tool is also the team-of-one case, which is what proved the slot sizing — a
  single empty slot used to stretch to the full width of its row and, being square, to an equal
  height, burying the rest of the board beneath it
- With one slot free, applying runes creates the page with the exact styles and perks requested and
  makes it current; applying a second champion's runes **reuses the same slot** rather than
  consuming another, and both times the player's own pages came back byte-identical
- Across several real drafts: the assigned role's list drives the pick (Twitch on bot, Viego on
  jungle), that role's spells override the global preset, the ban lands, the declared champion
  shows during planning, runes apply on lock, and panic lock commits a hover before the timer runs
  out
- `npm run package:installer` builds clean, producing a signed-by-nobody NSIS installer that
  offers the firewall rule and the start-with-Windows shortcut, and removes both on uninstall
- The Android app builds, installs over adb, and launches on a real device (Redmi, MIUI V816,
  Android 13) — note that MIUI refuses adb installs until its **Install via USB** developer option
  is on, failing with `INSTALL_FAILED_USER_RESTRICTED` until then
- The phone remote serves its manifest and all four icons over the LAN address with the
  `application/manifest+json` content type both platforms require

Three bugs only real games surfaced, all since fixed and covered by regression tests that fail
against the code that had them:

- The ban was evaluated during `PLANNING`, found nothing legal that early, and burned the action's
  one-shot guard — so the real ban turn was skipped silently a minute later
- The ban then sat out its first proper attempt too, because the client's `bannable-champion-ids`
  omits champions it will accept moments later
- Declaring a pick wrote to `my-selection`, which reports success and shows nothing

Mode picking, verified against a **live League client**:

- `/lol-game-queues/v1/queues` returns 88 rows; filtering leaves the 18 the client's own play menu
  offers, and the tabs and headings come out matching the client's exactly:
  **PvP** — Summoner's Rift (Normal/Draft Pick, Swiftplay, Ranked Solo/Duo, Ranked Flex), ARAM
  (ARAM, Mayhem, Mayhem Classic-ish), Teamfight Tactics (five, including Double Up and Tocker's
  Trials), Arena, Classic Rift (Classic 5v5); **Co-op vs. AI** — Summoner's Rift (Intro, Beginner,
  Intermediate), Classic Rift (Classic Co-op vs. AI)
- Nothing lands in "Other modes", and each group orders the way a player expects (Normal before
  Ranked, Intro before Intermediate). Groups sort by lowest queue id, which tracks the client's own
  order and is stable — sorting by group size was not, since one extra TFT variant pushed the Rift
  below it
- The two same-named Classic Rift queues stay distinct and land in the right tabs: 4310 under PvP,
  4320 under Co-op vs. AI
- The current lobby is reported by name: a live Practice Tool lobby came back as
  `queueName: "Multiplayer Practice Tool Custom"`, confirming the filter correctly treats customs
  as unpickable while still naming them
- `POST /api/queue` with no queueId is refused with 400

Driven through a browser against a stand-in agent serving that same captured list: every group
renders, draft is findable by its description, ranked modes are badged, choosing ARAM posts queue
450 and the card renames itself, the start-queue button appears, and leaving returns to the empty
state.

Friends and parties, against a live client with a real 184-friend list:

- The list comes back with online status, status messages and profile icons, and the three friends in
  a party were correctly reported as closed, each with its mode named from the queue cache
  ("Ranked Flex", "Normal", "ARAM: Mayhem") rather than a queue id
- Closed parties render an inert "Invite only" button; the Join button is disabled until there is
  something to join, and enables the moment a party id is pasted
- Every failure path gives a sentence rather than an enum: no tag in the Riot ID, a name that does
  not exist, unparseable paste, and a stale party id (which the client answers `PARTY_NOT_FOUND`)
- The list groups into the client's own categories in order, empty ones omitted, with each friend
  labelled by the mode they are in ("Ranked Flex", "ARAM: Mayhem", "Howling Abyss Blind Custom")
  rather than by a chat status. Offline starts collapsed and expands on request
- Reordering persists to `localStorage`, survives a full page reload, and the status view redraws in
  the new order immediately — checked by moving "In game" below "Online" and confirming both the
  header order and a reload agree
- Friend groups verified end to end against a live 184-friend, two-group list, driven through the
  actual UI: switching to the group view lists Ungrouped and the existing custom group; creating,
  renaming, moving a real friend into the new group (confirmed by the toast and an updated count), and
  deleting it all worked, and deleting relocated that friend back to Ungrouped exactly as the client's
  own behaviour promises. The friend was moved back and the test group removed afterward, leaving the
  list as it was found
- Invite is offered only where it can land. Against a live list with a lobby open: In game 13 → none,
  Champion select 1 → none, Riot Mobile 8 → none, Other Riot games 1 → none, Offline 158 → none,
  Online 2 → both, and the one friend with an open party got Join instead
- Inviting works end to end: refused with a readable message when there is no lobby, accepted once
  there is (`{ ok: true, sent: 1 }`, and logged), and an empty list is rejected. Verified by
  inviting *this* account, so nobody else was contacted
- With a lobby up, every friend row offers Invite — including friends sitting in a closed party of
  their own, where inviting is the useful action and joining is not on offer

**Not tested, all three needing another person:** sending a real friend request, joining a real open
party, and tapping Invite on an actual friend. Each of those puts something in somebody else's
client, so the success paths were left alone — the routes, the validation and the error paths are
exercised above, and the invite route itself was proven by inviting this same account.

Custom lobbies and the browser, against the same live client:

- Practice Tool (3140), SR Draft Pick Custom (3110) with team size 3, a password and lobby-only
  spectators, and Howling Abyss Blind Custom (3200) all created successfully through the agent's own
  API, and the draft custom came back with the role selector enabled where the blind ones did not
- A bad spectator policy is refused with a readable message rather than passed to the client
- The public browser returned 100 lobbies with names, owners, resolved map names, player counts and
  password flags
- All five tabs render on a phone-sized viewport, and the create form shows name, team size, password
  and spectator controls

**Not tested:** actually joining someone's lobby. The route is confirmed to exist — a deliberately
bogus party id comes back `400 PARTY_NOT_FOUND` rather than 404 — but joining a stranger's game to
prove it seemed a poor use of somebody else's lobby.

Then exercised for real, from a phone against a live client: **11 mode switches** covering every
group — Normal (Draft Pick), Swiftplay, Ranked Solo/Duo, Ranked Flex, ARAM, ARAM: Mayhem
Classic-ish, Teamfight Tactics (Double Up) and Classic — with matchmaking started and stopped on top.
Every switch landed, and the client's own play menu followed each one.

QR pairing, verified without a phone in hand:

- The payload round-trips between the two libraries that have to agree on it — encoded with
  `qrcode` exactly as the agent does, rasterised, and decoded with the same `jsqr` the app's scanner
  runs, across several address and port shapes
- The parser refuses what it should: a five-digit or non-numeric code, a bare `host:port`, someone
  else's QR (a Wi-Fi join code), and an arbitrary `https://` URL
- The dev agent prints a scannable terminal QR and the matching link above its pairing banner
- Agent, web and desktop all typecheck and build clean with it in; lazy-loading the scanner keeps
  the decoder out of the initial bundle, which came down from 483 kB to 386 kB

Role and pick-order swaps, built against the client's own `/help` rather than from memory — the
route names, the `{ id, cellId, state }` contract and all eight `state` values were read off a live
client, and the derived URLs confirmed against it (a real route answers `RPC_ERROR` / "No active
delegate" outside champ select, where an invented one answers `RESOURCE_NOT_FOUND` / "Invalid URI
format"). Driven through the actual UI against a captured draft holding one swap in each state:

- The card shows an incoming request with Accept and Decline, an outgoing one with Cancel, and the
  teammates who could be asked — and each button sends the right kind, id and verb
  (`accept`/`decline` on the position swap it was drawn for, `cancel` on the pick-order one, and
  `request` on the teammate actually tapped)
- `BUSY` and `DECLINED` entries render nothing at all, rather than a button the client would refuse
- The route refuses a bad kind, a bad action, a missing id, and an id the client is not currently
  offering, each with a sentence rather than a status code

**Not tested, needing four other people:** a swap actually completing. Every request the phone can
send has been checked into the agent and every response path exercised, but nobody has pressed
Accept on the other end.

**Not yet seen in a real draft:** the enemy half of the champ-select board. Practice Tool has no
opposing team and no bans, so the one mode it has been exercised in is exactly the one that cannot
show either — the enemy row and the split ban rows have only been driven against captured sessions.
The parsing they rest on is covered (both sides reported, derived from actions alone, a partial
report filling in, no double-counting, an empty enemy team), but a real draft is what will say
whether the client populates those fields when this expects it to.

**Not yet tested with a live client:** bench swap. **Not yet tested on a real phone:** the QR
itself — neither a camera app scanning the desktop window nor the in-app scanner has been pointed at
a physical screen, and the app's camera path additionally depends on Capacitor's WebChromeClient
granting the `CAMERA` permission the manifest now declares. The installer has been built but not
*run* — its own pages and the firewall rule it adds need an elevated install to exercise. The iOS
shell has never been compiled at all.

## Ideas for later

- A web manifest, so adding the remote to the home screen gives a real icon and a fullscreen launch
  rather than a bookmark
- Bring [`app/`](app) up to parity with `web/` (roles, backup picks, runes)
- Cloud relay so it works off your home Wi-Fi (a small WebSocket server both sides dial out to)
