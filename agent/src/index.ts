import { Session } from "./session.js";
import { startServer } from "./server.js";
import { getPairingCode, localAddresses, SERVER_PORT } from "./config.js";

function banner(): void {
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
  console.log("  Enter those in the phone app, on the same Wi-Fi.");
  console.log("  Keep this window open while you play.");
  console.log("");
}

async function main(): Promise<void> {
  banner();

  const session = new Session();
  await startServer(session);

  process.on("unhandledRejection", (reason) => {
    console.error("[agent] Unhandled rejection:", reason);
  });

  await session.start();
}

void main();
