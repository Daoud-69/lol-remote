/**
 * The visual half of the alerts, for when the app is not on screen.
 *
 * Two very different delivery routes behind one call. Inside the Android app
 * Capacitor posts a real system notification, which survives the screen being
 * off and is the only thing here that reaches you with the app backgrounded.
 * In a browser it falls back to the Notification API, which needs permission
 * and does nothing on iOS Safari — so notifications are always an addition to
 * the alarm and the vibration, never the only channel.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const CHANNEL_ID = "lol-remote-alerts";

let ready = false;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Asks for whatever permission this platform needs. Call from a user gesture:
 * browsers require one, and Android 13+ shows a runtime prompt.
 */
export async function prepareNotifications(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const status = await LocalNotifications.requestPermissions();
      const granted = status.display === "granted";
      if (granted && !ready) {
        // A high-importance channel is what lets a notification make noise and
        // appear over the lock screen; the default channel does neither.
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: "Match alerts",
          description: "Queue pops and game starts",
          importance: 5,
          visibility: 1,
          vibration: true,
        });
        ready = true;
      }
      return granted;
    } catch {
      return false;
    }
  }

  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notificationsAllowed(): boolean {
  if (isNativeApp()) return ready;
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

let nextId = 1;

export async function notify(title: string, body: string): Promise<void> {
  if (isNativeApp()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nextId++,
            title,
            body,
            channelId: CHANNEL_ID,
            smallIcon: "ic_launcher",
            // Undismissable-by-swipe would be hostile; this just floats it up.
            ongoing: false,
          },
        ],
      });
    } catch {
      // Permission revoked mid-session, or the plugin is unavailable.
    }
    return;
  }

  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "lol-remote", renotify: true } as NotificationOptions);
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}
