import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api, type Connection } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers this phone for push so a queue pop wakes it even with the app
 * closed. The agent — not the phone — sends the push, using its own internet
 * connection, which is why this works on a LAN-only setup.
 *
 * Fails quietly: the in-app alert and vibration still work without it.
 */
export function usePushRegistration(connection: Connection | null): void {
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;

    void (async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("ready-check", {
            name: "Ready check",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 400, 200, 400],
            sound: "default",
            bypassDnd: true,
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let granted = existing.granted;
        if (!granted) {
          const requested = await Notifications.requestPermissionsAsync();
          granted = requested.granted;
        }
        if (!granted || cancelled) return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

        const token = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (cancelled) return;

        await api.registerPushToken(connection, token.data);
      } catch (error) {
        console.warn("Push registration skipped:", (error as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection]);
}
