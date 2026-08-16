import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Connection } from "../lib/api";
import type { AutomationPatch, AutomationSettings } from "../types";

/**
 * Applies a patch exactly the way the agent does, so the optimistic copy and
 * the authoritative one cannot drift.
 */
export function mergeAutomation(
  current: AutomationSettings,
  patch: AutomationPatch,
): AutomationSettings {
  return {
    ...current,
    ...patch,
    rolePresets: { ...current.rolePresets, ...patch.rolePresets },
    runePages: { ...current.runePages, ...patch.runePages },
  } as AutomationSettings;
}

/**
 * Settings that respond to a tap immediately instead of a round trip later.
 *
 * Every edit here is read-modify-write — "append this champion to the list" is
 * computed from the list the screen is showing. Reading that straight off the
 * WebSocket state made each tap depend on the previous one's push having
 * already landed; tap twice quickly and the second patch was built from a list
 * that did not contain the first champion yet, silently dropping it.
 *
 * So apply the patch locally at once and send it, and only adopt what the
 * agent echoes back once nothing is in flight.
 */
export function useAutomation(
  serverSettings: AutomationSettings,
  connection: Connection,
  onError: (message: string) => void,
): readonly [AutomationSettings, (patch: AutomationPatch) => void] {
  const [settings, setSettings] = useState(serverSettings);
  const inFlight = useRef(0);
  const latestServer = useRef(serverSettings);

  latestServer.current = serverSettings;

  useEffect(() => {
    // A push that arrives mid-write is describing a state older than what the
    // user has already done, so let the in-flight writes finish first.
    if (inFlight.current === 0) setSettings(serverSettings);
  }, [serverSettings]);

  const update = useCallback(
    (patch: AutomationPatch) => {
      setSettings((current) => mergeAutomation(current, patch));
      inFlight.current += 1;

      void api
        .setAutomation(connection, patch)
        .then((confirmed) => {
          // Only the last write still outstanding may adopt the agent's copy;
          // an earlier one's response is already out of date.
          if (inFlight.current === 1) setSettings(confirmed);
        })
        .catch((error: Error) => {
          onError(error.message);
          // Roll back to whatever the agent last told us was true.
          if (inFlight.current === 1) setSettings(latestServer.current);
        })
        .finally(() => {
          inFlight.current -= 1;
        });
    },
    [connection, onError],
  );

  return [settings, update] as const;
}
