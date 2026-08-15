// Converts the shared app icon into a multi-size .ico for the Windows exe
// and the installer. Only needs to be re-run if the source icon changes —
// the .ico is committed to agent/assets so package:exe doesn't depend on
// the app/ directory.
import pngToIco from "png-to-ico";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourcePng = path.join(root, "..", "app", "assets", "icon.png");
const outIco = path.join(root, "assets", "icon.ico");

const buffer = await pngToIco(sourcePng);
writeFileSync(outIco, buffer);
console.log(`Built ${outIco}`);
