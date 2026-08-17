import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell around the same remote the agent serves.
 *
 * The UI is bundled rather than loaded from the PC, so the app opens to its
 * connect screen without needing the agent's address first — the address is
 * something you type in, not something the app needs in order to start.
 */
const config: CapacitorConfig = {
  appId: "com.lolremote.app",
  appName: "LoL Remote",
  webDir: "dist",
  android: {
    // The agent speaks plain HTTP on your LAN. Left on the default https
    // scheme, the WebView would treat every call to it as mixed content and
    // block it; serving the bundled app over http makes the request
    // same-scheme, and cleartext is separately permitted in the manifest.
    allowMixedContent: true,
  },
  server: {
    androidScheme: "http",
    // ws:// to the agent is cleartext too, so the socket needs the same
    // allowance the fetches get.
    cleartext: true,
  },
};

export default config;
