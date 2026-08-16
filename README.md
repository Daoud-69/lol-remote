# LoL Remote

Control League of Legends champion select from your phone — accept the ready check, pick or ban a
champion, and choose your skin, without touching the keyboard.

**[⬇ Download](https://github.com/Daoud-69/lol-remote/releases/latest)**, run the installer on your
gaming PC, then open the link it shows you on your phone. That's the whole setup.

## What it does

**From the phone, live:**
- Accept / decline the ready check (full-screen takeover + vibration + push notification)
- Pick your two lobby roles — the same selector the client shows, driven from the phone
- Hover and lock a champion on your pick turn, or ban on your ban turn
- Set both summoner spells
- Pick a skin once you're locked in (owned skins selectable, locked ones shown greyed)
- Swap from the ARAM/Swiftplay bench
- Start and stop matchmaking

**Automation, for when you're not looking at the phone either:**
- Auto-accept, with an optional delay so you can still decline
- **A pick list per role**, tried in order — your second and third choices cover the case where
  someone bans or takes your first. Because the list is chosen by the role the client *actually*
  assigned, an autofill picks from that role's list instead of stranding you on your main.
- **Declare your pick in the planning phase**, so the team sees your champion before bans start
- An ordered ban list, which skips anything a teammate has already declared
- Preset summoner spells, globally or per role
- **A rune page per champion** — build one in the app, or load one of the client's own
  recommendations for that champion and role. Applied automatically when you lock in.
- **Panic lock** — commits whatever is hovered a few seconds before the timer expires, so a phone
  that loses signal mid-select doesn't leave you with a random champion

**A note on rune pages.** Accounts have a hard cap on how many rune pages they can hold, so
"a page per champion" isn't something the client can store. Instead the agent keeps exactly one
page of its own, named `LoL Remote — <champion>`, and rewrites it each time you lock in. Pages you
made yourself are never touched. If your account is at its cap and the agent has no page of its
own yet, it says so and does nothing rather than deleting one of yours to make room — free a slot
in the client once, and it will reuse that slot from then on.

## Setup

### 1. Agent (on the gaming PC)

**[`desktop/`](desktop) is the app to install** — a proper Windows program with its own window: the
pairing code and address front and center, live League-client status, a connected-phone indicator,
and an activity feed, styled to match the [`web/`](web) remote control. Minimizes to the tray
instead of quitting, so closing the window doesn't drop your phone's connection.

It also serves the [`web/`](web) remote control itself, from the same address it already shows —
open that link in your phone's browser and you get the actual app UI, no separate server to start,
no app install needed. The address doubles as both the API endpoint and the web app's URL.

```bash
cd desktop
npm install
npm run package:installer
```

Produces `desktop/build/dist/LoLRemoteAgent-Setup.<version>.exe`. Running it installs like any other
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

### 2. App (on your phone)

**The remote the agent serves is [`web/`](web)** — open the address the agent window shows and you
have it, no install. [`app/`](app) is a second, Expo-based client kept for the native extras
(vibration, push while closed); it has **not** been updated for role presets, backup picks or
runes, and its auto-pick / auto-ban controls write settings the agent no longer reads.

The project is already scaffolded on **Expo SDK 57** with dependencies resolved, so this is just:

```bash
cd app
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone (same Wi-Fi as the PC), then enter the IP, port and
pairing code from the agent window.

To preview the UI in a browser without a phone:

```bash
npx expo start --web    # then open http://localhost:8081
```

Most of it works on web — the connect flow, live state, automation toggles. Vibration and push
notifications are no-ops there.

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

## Project layout

```
agent/src/
  index.ts              Entry point, prints the pairing banner
  config.ts             Pairing code, saved automation settings, push tokens (~/.lol-remote)
  session.ts            Owns the client connection, live state, automation rules
  server.ts             REST + WebSocket the phone talks to
  push.ts               Expo push sender
  types.ts              The agent↔phone contract
  lcu/
    credentials.ts      Finds the client's port + auth token
    client.ts           HTTPS + WAMP WebSocket wrapper
    actions.ts          accept / pick / ban / spells / skin, session parsing
    gamedata.ts         Champion, spell and skin catalogs (served by the client itself)

app/
  App.tsx               Tab shell, ready-check overlay, toasts
  src/api.ts            Typed client for the agent
  src/useAgent.ts       Live WebSocket state with reconnect
  src/screens/          Connect, Status, ChampSelect, Automation
  src/components/       Champion grid, skin carousel, spell picker, UI primitives

desktop/src/            Electron shell around agent/src — the app to actually install, see above
  main/index.ts          Starts the same Session + startServer as agent/'s dev entry, plus tray/window/IPC
  preload/index.ts        contextBridge API the renderer calls into
  renderer/src/          Pairing code, status, and activity feed UI (styled to match web/)
```

## How the interesting parts work

**Architecture.**

```
Phone (Expo app)  ──HTTP + WebSocket──▶  Agent (Node, on your PC)  ──▶  League Client API
        ▲                                        │
        └────────── Expo push ───────────────────┘   "Queue popped!"
```

The agent talks to the **LCU** (League Client Update) API — the same local HTTPS API the client's
own UI uses. It reads the port and auth token from the running `LeagueClientUx.exe` process, so
there's nothing to configure.

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

**Which champion to pick.** The agent reads `assignedPosition` off its own slot in `myTeam`, looks
up that role's list, and takes the first entry the client still reports in
`pickable-champion-ids` and that nobody has banned or locked. Autofill needs no special case: the
role the client assigned *is* the lookup key, so being handed support instead of mid simply reads
a different list. Bans work the same way against `bannable-champion-ids`, minus anything a
teammate has declared via `championPickIntent`.

**Declaring a pick.** During the `PLANNING` phase there is no action in progress to patch, so
intent goes through `PATCH /lol-champ-select/v1/session/my-selection` with just a `championId`.
That is what populates `championPickIntent` on your team slot and puts the champion on everyone's
screen; it commits nothing.

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

- Both halves typecheck clean (agent on TS 5.7, app on TS 6 / React 19 / RN 0.86)
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
- With one slot free, applying runes creates the page with the exact styles and perks requested and
  makes it current; applying a second champion's runes **reuses the same slot** rather than
  consuming another, and both times the player's own pages came back byte-identical

**Not yet tested with a live client:** pick, skin and bench swap.

## Ideas for later

- QR pairing (`expo-camera`) instead of typing the IP and code
- Bring [`app/`](app) up to parity with `web/` (roles, backup picks, runes)
- Cloud relay so it works off your home Wi-Fi (a small WebSocket server both sides dial out to)
