import { getPushTokens } from "./config.js";

/**
 * Sends a notification through Expo's push service so the phone buzzes even
 * when the app is closed. The agent has internet access even though the phone
 * only reaches it over the LAN, so this works without a relay of our own.
 *
 * Silently degrades: if no phone has registered a token, or the send fails,
 * the in-app alert over the WebSocket still fires.
 */
export async function sendPush(title: string, body: string): Promise<void> {
  const tokens = getPushTokens();
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default",
    priority: "high",
    // Surfaces as a time-sensitive alert rather than a quiet banner.
    channelId: "ready-check",
    interruptionLevel: "time-sensitive",
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`[push] Expo rejected the send: ${response.status}`);
    }
  } catch (error) {
    console.warn(`[push] Could not reach Expo: ${(error as Error).message}`);
  }
}
