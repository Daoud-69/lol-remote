import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, shell, screen } from "electron";
import { electronApp, is } from "@electron-toolkit/utils";
import { join } from "node:path";
import QRCode from "qrcode";
import { Session } from "../../../agent/src/session.js";
import { startServer, type ServerHandle } from "../../../agent/src/server.js";
import {
  getPairingCode,
  regeneratePairingCode,
  localAddresses,
  pairingUrl,
  SERVER_PORT,
} from "../../../agent/src/config.js";
import type { AgentState } from "../../../agent/src/types.js";
import pkg from "../../package.json";
import { checkForUpdate, UPDATE_CHECK_INTERVAL_MS, type UpdateStatus } from "./updateCheck.js";

// Packaged, __dirname is inside app.asar and build/ is not in there — the icon
// ships as an extraResource instead (see electron-builder.yml). Running from
// source it is just the sibling file.
const iconPath = app.isPackaged
  ? join(process.resourcesPath, "icon.ico")
  : join(__dirname, "../../build/icon.ico");

// Packaged builds get web/dist copied in as an extraResource (see
// electron-builder.yml); running from source, it's just the sibling project.
const webDir = app.isPackaged
  ? join(process.resourcesPath, "web-dist")
  : join(__dirname, "../../../web/dist");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverHandle: ServerHandle | null = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.lolremote.agent");

    const session = new Session();
    serverHandle = await startServer(session, { webDir });
    void session.start();

    session.on("state", () => pushState(session));
    setInterval(() => pushState(session), 2000); // keeps the phone count fresh

    registerIpc(session);
    createTray();
    createWindow();

    // Deliberately after the window: the check reaches the internet, and
    // nothing about starting the agent should wait on GitHub answering.
    void refreshUpdateStatus();
    setInterval(() => void refreshUpdateStatus(), UPDATE_CHECK_INTERVAL_MS);
  });
}

function createWindow(): void {
  // Wide enough that the embedded Remote control tab gets the web app's full
  // two-column layout by default, rather than opening cramped into its
  // single-column (phone-width) fallback. Still never bigger than the screen.
  const { workAreaSize } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    width: Math.min(960, workAreaSize.width - 80),
    height: Math.min(900, workAreaSize.height - 80),
    minWidth: 400,
    // Was 560, which is roughly what the cards need laid out in full. Now that
    // the window scrolls rather than clipping, it can go smaller than its
    // content and still be usable — handy parked in a corner while you play.
    minHeight: 420,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#09090b",
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createTray(): void {
  // createFromPath returns an empty image for a missing file rather than
  // throwing, and Tray accepts it — you get a working tooltip attached to
  // nothing visible. Say so instead of leaving it to be noticed in the tray.
  const loaded = nativeImage.createFromPath(iconPath);
  if (loaded.isEmpty()) {
    // eslint-disable-next-line no-console
    console.error(`[agent] Tray icon missing or unreadable at ${iconPath}`);
  }
  const image = loaded.isEmpty() ? loaded : loaded.resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip("LoL Remote Agent");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show LoL Remote", click: () => showWindow() },
      { type: "separator" },
      { label: "Quit", click: () => quit() },
    ]),
  );
  tray.on("click", () => showWindow());
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quit(): void {
  quitting = true;
  app.quit();
}

function pushState(session: Session): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("agent:state", {
    state: session.getState(),
    connectedPhones: serverHandle?.getConnectedPhoneCount() ?? 0,
    connectedClients: serverHandle?.getConnectedClients() ?? [],
    update: updateStatus,
  } satisfies AgentPush);
}

function registerIpc(session: Session): void {
  ipcMain.handle("agent:getInfo", () => ({
    pairingCode: getPairingCode(),
    addresses: localAddresses(),
    port: SERVER_PORT,
    state: session.getState(),
    connectedPhones: serverHandle?.getConnectedPhoneCount() ?? 0,
    connectedClients: serverHandle?.getConnectedClients() ?? [],
    servingWebApp: serverHandle?.servingWebApp ?? false,
    update: updateStatus,
  }));

  ipcMain.handle("agent:regenerateCode", () => regeneratePairingCode());
  ipcMain.handle("app:copy", (_event, text: string) => clipboard.writeText(text));

  /**
   * The pairing link for one address, plus a QR of it to put on screen.
   *
   * Built here rather than in the renderer so the URL has exactly one
   * definition (agent/src/config.ts), shared with the terminal banner.
   * Rendered dark-on-white regardless of the app's own dark theme — an
   * inverted QR is a coin flip on whether a given phone camera reads it.
   */
  ipcMain.handle("agent:pairingQr", async (_event, address: string) => {
    const url = pairingUrl(address);
    const dataUrl = await QRCode.toDataURL(url, {
      width: 320,
      margin: 1,
      color: { dark: "#0b0d12ff", light: "#ffffffff" },
    });
    return { url, dataUrl };
  });
}

export interface AgentPush {
  state: AgentState;
  connectedPhones: number;
  /** What is attached, so the window can name each remote rather than count them. */
  connectedClients: { kind: string; label: string }[];
  /** Rides the regular push: the check finishes after the window asks, and a
   *  one-shot event would land before the renderer was listening. */
  update: UpdateStatus;
}

/**
 * The running version, baked in at build time rather than asked of Electron.
 *
 * `app.getVersion()` reports the app's version only once packaged; from source
 * it answers with Electron's own, which would have the update check comparing
 * 43.4.0 against 1.6.1 and declaring itself years ahead.
 */
const APP_VERSION = pkg.version;

let updateStatus: UpdateStatus = {
  current: APP_VERSION,
  latest: null,
  url: "https://github.com/Daoud-69/lol-remote/releases/latest",
  outdated: false,
};

async function refreshUpdateStatus(): Promise<void> {
  updateStatus = await checkForUpdate(APP_VERSION);
  if (updateStatus.outdated) {
    console.log(`[agent] Update available: ${updateStatus.latest} (running ${APP_VERSION})`);
  }
}

app.on("window-all-closed", () => {
  // Keep running in the tray — the server should survive the window closing.
});

app.on("before-quit", () => {
  quitting = true;
});
