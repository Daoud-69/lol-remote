// Bundles the agent into a single CJS file and injects it into a copy of the
// current Node binary using Node's built-in Single Executable Application
// support, so a friend can run LoLRemoteAgent.exe with no Node.js install.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildDir = path.join(root, "build");
const bundlePath = path.join(buildDir, "bundle.cjs");
const blobPath = path.join(buildDir, "sea-prep.blob");
const exePath = path.join(buildDir, "LoLRemoteAgent.exe");
const seaConfigPath = path.join(root, "sea-config.json");

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

runNpx(["esbuild", "src/index.ts", "--bundle", "--platform=node", "--target=node20", "--format=cjs", "--outfile=build/bundle.cjs"]);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], { cwd: root, stdio: "inherit" });

copyFileSync(process.execPath, exePath);
runNpx([
  "postject",
  exePath,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
]);

console.log(`\nBuilt ${exePath}`);

function runNpx(args) {
  // npx resolves to a .cmd shim on Windows, which node can only spawn through a
  // shell. Node warns that shell + args is unsafe with untrusted input, but
  // every arg here is a fixed string this script wrote itself.
  execFileSync("npx", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
}
