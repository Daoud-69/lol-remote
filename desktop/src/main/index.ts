import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, shell } from "electron";
import { electronApp, is } from "@electron-toolkit/utils";
import { join } from "node:path";
import { Session } from "../../../agent/src/session.js";
import { startServer, type ServerHandle } from "../../../agent/src/server.js";
import {
  getPairingCode,
  regeneratePairingCode,
  localAddresses,
  SERVER_PORT,
} from "../../../agent/src/config.js";
import type { AgentState } from "../../../agent/src/types.js";

const iconPath = join(__dirname, "../../build/icon.ico");

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
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 720,
    minWidth: 400,
    minHeight: 560,
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
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
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
  } satisfies AgentPush);
}

function registerIpc(session: Session): void {
  ipcMain.handle("agent:getInfo", () => ({
    pairingCode: getPairingCode(),
    addresses: localAddresses(),
    port: SERVER_PORT,
    state: session.getState(),
    connectedPhones: serverHandle?.getConnectedPhoneCount() ?? 0,
    servingWebApp: serverHandle?.servingWebApp ?? false,
  }));

  ipcMain.handle("agent:regenerateCode", () => regeneratePairingCode());
  ipcMain.handle("app:copy", (_event, text: string) => clipboard.writeText(text));
}

export interface AgentPush {
  state: AgentState;
  connectedPhones: number;
}

app.on("window-all-closed", () => {
  // Keep running in the tray — the server should survive the window closing.
});

app.on("before-quit", () => {
  quitting = true;
});
