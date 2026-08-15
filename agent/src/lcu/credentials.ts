import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";

const exec = promisify(execFile);

export interface LcuCredentials {
  port: number;
  password: string;
  protocol: "https";
}

/**
 * The client's own command line carries everything we need, and it works no
 * matter where the user installed the game. We fall back to the lockfile when
 * the process query is unavailable (locked-down machines, non-admin shells).
 */
async function fromProcessList(): Promise<LcuCredentials | null> {
  const commandLine = await readClientCommandLine();
  if (!commandLine) return null;

  const port = /--app-port=(\d+)/.exec(commandLine)?.[1];
  const password = /--remoting-auth-token=([\w-]+)/.exec(commandLine)?.[1];
  if (!port || !password) return null;

  return { port: Number(port), password, protocol: "https" };
}

async function readClientCommandLine(): Promise<string | null> {
  if (process.platform === "win32") {
    const script =
      "Get-CimInstance Win32_Process -Filter \"name = 'LeagueClientUx.exe'\" " +
      "| Select-Object -ExpandProperty CommandLine";
    try {
      const { stdout } = await exec(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  // macOS / Linux (Wine): ps carries the same flags.
  try {
    const { stdout } = await exec("/bin/sh", [
      "-c",
      "ps x -o command | grep -i 'LeagueClientUx' | grep -v grep",
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function candidateLockfilePaths(): string[] {
  const explicit = process.env.LOL_INSTALL_DIR;
  const paths: string[] = [];

  if (explicit) paths.push(path.join(explicit, "lockfile"));

  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    for (const drive of ["C:", "D:", "E:"]) {
      paths.push(path.join(drive, "\\Riot Games\\League of Legends\\lockfile"));
    }
    paths.push(path.join(localAppData, "Riot Games", "League of Legends", "lockfile"));
  } else {
    paths.push("/Users/Shared/Riot Games/League of Legends/lockfile");
    paths.push(
      path.join(os.homedir(), "Applications", "League of Legends.app", "Contents", "LoL", "lockfile"),
    );
  }

  return paths;
}

async function fromLockfile(): Promise<LcuCredentials | null> {
  for (const file of candidateLockfilePaths()) {
    try {
      const raw = await readFile(file, "utf8");
      // Format: LeagueClient:<pid>:<port>:<password>:https
      const parts = raw.trim().split(":");
      if (parts.length < 5) continue;
      return { port: Number(parts[2]), password: parts[3], protocol: "https" };
    } catch {
      // Not installed at this path, or client not running. Try the next one.
    }
  }
  return null;
}

export async function findCredentials(): Promise<LcuCredentials | null> {
  return (await fromProcessList()) ?? (await fromLockfile());
}

/** Resolves once the League client is running and reachable. */
export async function waitForCredentials(
  onWaiting?: () => void,
  intervalMs = 3000,
): Promise<LcuCredentials> {
  let announced = false;
  for (;;) {
    const credentials = await findCredentials();
    if (credentials) return credentials;
    if (!announced) {
      announced = true;
      onWaiting?.();
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
