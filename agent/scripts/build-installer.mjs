// Builds the standalone exe, then wraps it in a Windows installer
// (Start Menu + desktop shortcuts, firewall rule, uninstaller) using Inno
// Setup. The compiler binaries ship inside the innosetup-compiler npm
// package, so this needs nothing installed on the machine beyond `npm i`.
import iscc from "innosetup-compiler";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const scriptPath = path.join(root, "installer", "setup.iss");

execFileSync(process.execPath, [path.join(root, "scripts", "package-exe.mjs")], {
  cwd: root,
  stdio: "inherit",
});

process.env.LOL_REMOTE_VERSION = pkg.version;
await iscc(scriptPath, { verbose: true });

console.log(`\nBuilt ${path.join(root, "build", "LoLRemoteAgent-Setup.exe")}`);
