import QRCode from "qrcode";
import { Session } from "./session.js";
import { startServer } from "./server.js";
import { getPairingCode, localAddresses, pairingUrl, SERVER_PORT } from "./config.js";

async function banner(): Promise<void> {
  const code = getPairingCode();
  const addresses = localAddresses();

  console.log("");
  console.log("  LoL Remote — agent");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Pairing code:  ${code}`);
  if (addresses.length === 0) {
    console.log("  Address:       no network interface found");
  } else {
    for (const address of addresses) {
      console.log(`  Address:       ${address}:${SERVER_PORT}`);
    }
  }
  console.log("");

  // A terminal QR is only worth drawing for one address, and with several
  // interfaces (Ethernet plus Wi-Fi, or a VM's virtual adapter) there is no way
  // to tell from here which one the phone can reach. The first is the usual
  // answer; the desktop app is where you get to pick.
  const [first] = addresses;
  if (first) {
    const url = pairingUrl(first);
    console.log(await QRCode.toString(url, { type: "terminal", small: true }));
    console.log(`  Scan that, or open ${url}`);
    console.log("");
  }

  console.log("  Same Wi-Fi as this PC. Keep this window open while you play.");
  console.log("");
}

async function main(): Promise<void> {
  await banner();

  const session = new Session();
  await startServer(session);

  process.on("unhandledRejection", (reason) => {
    console.error("[agent] Unhandled rejection:", reason);
  });

  await session.start();
}

void main();
