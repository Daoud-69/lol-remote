# LoL Remote

Control League of Legends champion select from your phone: accept the ready check, pick or ban a
champion, set summoner spells, and choose your skin — all while you're away from the PC.

**[⬇ Download the latest release](https://github.com/Daoud-69/lol-remote/releases/latest)** — just
run the installer, no separate setup needed. (Cloning/downloading this repo as source only gets you
the code, not a runnable app — see [Setup](#setup) below if that's what you're after.)

```
Phone (Expo app)  ──HTTP + WebSocket──▶  Agent (Node, on your PC)  ──▶  League Client API
        ▲                                        │
        └────────── Expo push ───────────────────┘   "Queue popped!"
```

The agent talks to the **LCU** (League Client Update) API — the same local HTTPS API the client's
own UI uses. It reads the port and auth token from the running `LeagueClientUx.exe` process, so
there's nothing to configure.

## What it does

**From the phone, live:**
- Accept / decline the ready check (full-screen takeover + vibration + push notification)
- Hover and lock a champion on your pick turn, or ban on your ban turn
- Set both summoner spells
- Pick a skin once you're locked in (owned skins selectable, locked ones shown greyed)
- Swap from the ARAM/Swiftplay bench
- Start and stop matchmaking

**Automation, for when you're not looking at the phone either:**
- Auto-accept, with an optional delay so you can still decline
- Auto-pick and auto-ban a preset champion (hover-only or full lock)
- Preset summoner spells applied on entering champ select
- **Panic lock** — commits whatever is hovered a few seconds before the timer expires, so a phone
  that loses signal mid-select doesn't leave you with a random champion

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

**Not yet tested:** every call that needs a live League client — accept, pick, ban, spells, skins,
bench swap. Those are the endpoints to watch on first real use.

## Ideas for later

- QR pairing (`expo-camera`) instead of typing the IP and code
- Rune page selection — `/lol-perks/v1/pages`
- Position-aware presets: auto-pick a different champion per assigned role
- Cloud relay so it works off your home Wi-Fi (a small WebSocket server both sides dial out to)
