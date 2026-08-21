/**
 * Working out what just connected.
 *
 * Two signals, in that order of trust. The remote knows exactly what it is —
 * Capacitor answers that question directly — so it says so on the socket URL,
 * and that is taken at face value. The `User-Agent` is the fallback, for a
 * remote too old to announce itself or anything else that dials the socket.
 *
 * The user agent alone would not do. It cannot separate the installed Android
 * app from Chrome on the same phone with any confidence: Capacitor's WebView
 * sends a string a browser could also send, and the `wv` token that used to
 * mark a WebView is neither guaranteed nor exclusive.
 */

import type { ClientKind, ConnectedClient } from "./types.js";

const LABELS: Record<ClientKind, string> = {
  "android-app": "Android app",
  "phone-browser": "Phone browser",
  "desktop-browser": "Desktop browser",
  unknown: "Unknown device",
};

/** Phone and tablet markers, checked before desktop ones — see below. */
const HANDHELD = /\b(Android|iPhone|iPad|iPod|Mobile|Windows Phone)\b/i;

/**
 * Desktop markers. Checked only after the handheld ones, because an Android
 * user agent also contains "Linux" and an iPad's can contain "Macintosh" —
 * testing these first would file half the phones on the network as laptops.
 */
const DESKTOP = /\b(Windows NT|Macintosh|X11|CrOS)\b/i;

export function classifyClient(declared: string | null, userAgent: string): ConnectedClient {
  const kind = detect(declared, userAgent);
  return { kind, label: LABELS[kind] };
}

function detect(declared: string | null, userAgent: string): ClientKind {
  // The remote's own word, when it gave one.
  if (declared === "android-app") return "android-app";

  const agent = userAgent || "";
  if (declared === "browser" || declared === null) {
    if (HANDHELD.test(agent)) return "phone-browser";
    if (DESKTOP.test(agent)) return "desktop-browser";
  }

  return "unknown";
}

export { LABELS as CLIENT_LABELS };
