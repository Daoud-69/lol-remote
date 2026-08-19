import { useCallback, useEffect, useRef, useState } from "react";
import {
  GAME_START_ALARM,
  READY_CHECK_ALARM,
  TURN_ALARM,
  playAlarm,
  stopAlarm,
  unlockAudio,
  type AlarmShape,
} from "../lib/alarm";
import { notificationsAllowed, notify, prepareNotifications } from "../lib/notify";
import type { AgentAlert, AlertKind } from "./useAgent";

export interface AlertPrefs {
  /** Ring when the queue pops. */
  readyCheck: boolean;
  /** Ring when the game actually starts and you need to be at the PC. */
  gameStart: boolean;
  /** Quieter chirp when it becomes your turn to pick or ban. */
  turn: boolean;
  /** Post a system notification alongside the sound. */
  notifications: boolean;
}

const DEFAULTS: AlertPrefs = {
  readyCheck: true,
  gameStart: true,
  turn: false,
  notifications: true,
};

const STORAGE_KEY = "lol-remote:alerts";

const SHAPES: Record<AlertKind, AlarmShape> = {
  "ready-check": READY_CHECK_ALARM,
  "game-start": GAME_START_ALARM,
  "pick-turn": TURN_ALARM,
  "ban-turn": TURN_ALARM,
};

const TITLES: Record<AlertKind, string> = {
  "ready-check": "Match found",
  "game-start": "Game starting",
  "pick-turn": "Your pick",
  "ban-turn": "Your ban",
};

function enabledFor(prefs: AlertPrefs, kind: AlertKind): boolean {
  if (kind === "ready-check") return prefs.readyCheck;
  if (kind === "game-start") return prefs.gameStart;
  return prefs.turn;
}

function load(): AlertPrefs {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULTS, ...(JSON.parse(saved) as Partial<AlertPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/**
 * Turns agent alerts into something that reaches you across the room.
 *
 * Three channels, deliberately independent: the alarm carries it when the
 * phone is awake and in earshot, vibration when it is face down, and a system
 * notification when the app is not on screen at all. Any one of them can be
 * unavailable — audio never unlocked, notifications denied, a browser without
 * either — without silencing the others.
 */
export function useAlerts(alert: AgentAlert | null) {
  const [prefs, setPrefs] = useState<AlertPrefs>(load);
  const [ringing, setRinging] = useState<AlertKind | null>(null);
  const [canNotify, setCanNotify] = useState(notificationsAllowed);
  const handledRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Private mode; preferences just will not persist.
    }
  }, [prefs]);

  const silence = useCallback(() => {
    stopAlarm();
    setRinging(null);
  }, []);

  useEffect(() => {
    if (!alert || alert.at === handledRef.current) return;
    handledRef.current = alert.at;

    if (!enabledFor(prefs, alert.kind)) return;

    playAlarm(SHAPES[alert.kind]);
    setRinging(alert.kind);

    // The ready check answers itself within seconds either way; a siren that
    // outlives the thing it is announcing is just noise.
    const linger = alert.kind === "ready-check" ? 15000 : 12000;
    const timer = setTimeout(silence, linger);

    if (prefs.notifications) void notify(TITLES[alert.kind], alert.message);

    return () => clearTimeout(timer);
  }, [alert, prefs, silence]);

  /** Wire to any tap: browsers refuse audio until the page has seen a gesture. */
  const armFromGesture = useCallback(() => {
    unlockAudio();
  }, []);

  const requestNotifications = useCallback(async () => {
    const granted = await prepareNotifications();
    setCanNotify(granted);
    setPrefs((current) => ({ ...current, notifications: granted }));
    return granted;
  }, []);

  const test = useCallback(
    (kind: AlertKind) => {
      unlockAudio();
      playAlarm(SHAPES[kind]);
      setRinging(kind);
      setTimeout(silence, 3000);
      if (prefs.notifications) void notify(TITLES[kind], "This is a test alert.");
    },
    [prefs.notifications, silence],
  );

  return {
    prefs,
    setPrefs,
    ringing,
    silence,
    armFromGesture,
    canNotify,
    requestNotifications,
    test,
  };
}
