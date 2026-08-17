import { contextBridge, ipcRenderer } from "electron";
import type { AgentPush } from "../main/index.js";
import type { AgentState } from "../../../agent/src/types.js";

export interface AgentInfo {
  pairingCode: string;
  addresses: string[];
  port: number;
  state: AgentState;
  connectedPhones: number;
  servingWebApp: boolean;
}

/** A pairing link and a QR image of it, for one of the PC's addresses. */
export interface PairingQr {
  url: string;
  /** PNG data URL, ready to drop straight into an <img>. */
  dataUrl: string;
}

const api = {
  getInfo: (): Promise<AgentInfo> => ipcRenderer.invoke("agent:getInfo"),
  regenerateCode: (): Promise<string> => ipcRenderer.invoke("agent:regenerateCode"),
  pairingQr: (address: string): Promise<PairingQr> =>
    ipcRenderer.invoke("agent:pairingQr", address),
  copy: (text: string): Promise<void> => ipcRenderer.invoke("app:copy", text),
  onState: (callback: (push: AgentPush) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, push: AgentPush) => callback(push);
    ipcRenderer.on("agent:state", listener);
    return () => ipcRenderer.removeListener("agent:state", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
