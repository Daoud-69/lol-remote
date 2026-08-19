/**
 * The audible half of the alerts.
 *
 * The tone is synthesised rather than bundled as an audio file: it costs no
 * download, cannot 404 out of the packaged app, and lets the ready-check alarm
 * keep going indefinitely without looping a clip audibly.
 *
 * Phones refuse to play audio until the page has seen a real user gesture, and
 * a queue popping is not one. So the context is created and unlocked on the
 * first tap anywhere and kept alive from then on — by the time an alarm has to
 * fire, the user has long since tapped Connect.
 */

let context: AudioContext | null = null;
let stopCurrent: (() => void) | null = null;

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Call from a user gesture. Safe to call repeatedly. */
export function unlockAudio(): void {
  const Ctor = audioContextCtor();
  if (!Ctor) return;
  if (!context) context = new Ctor();
  if (context.state === "suspended") void context.resume();
}

export function audioReady(): boolean {
  return context !== null && context.state === "running";
}

export interface AlarmShape {
  /** Alternating tone frequencies, in Hz. */
  tones: number[];
  /** Seconds each tone is held. */
  beat: number;
  /** How many times to run the pattern. 0 repeats until stopped. */
  repeats: number;
  volume: number;
}

/** Urgent two-tone warble, the one that has to wake someone up. */
export const READY_CHECK_ALARM: AlarmShape = {
  tones: [880, 1174],
  beat: 0.18,
  repeats: 0,
  volume: 0.9,
};

/** Lower and slower — informative rather than panic-inducing. */
export const GAME_START_ALARM: AlarmShape = {
  tones: [587, 784, 988],
  beat: 0.22,
  repeats: 6,
  volume: 0.85,
};

export const TURN_ALARM: AlarmShape = {
  tones: [660, 880],
  beat: 0.14,
  repeats: 3,
  volume: 0.7,
};

/**
 * Starts an alarm, replacing any that is already sounding, and returns a stop
 * function. Silently does nothing when audio was never unlocked — the
 * vibration and the notification still carry the alert in that case.
 */
export function playAlarm(shape: AlarmShape): () => void {
  stopAlarm();

  const Ctor = audioContextCtor();
  if (!Ctor) return () => undefined;
  if (!context) context = new Ctor();
  if (context.state === "suspended") void context.resume();

  const ctx = context;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const oscillator = ctx.createOscillator();
  oscillator.type = "square";
  oscillator.connect(master);

  const start = ctx.currentTime + 0.02;
  const cycles = shape.repeats > 0 ? shape.repeats : 240; // ~minutes, then stops on its own
  let at = start;

  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const tone of shape.tones) {
      oscillator.frequency.setValueAtTime(tone, at);
      // Shaped rather than square-edged, so it reads as a beep instead of a click.
      master.gain.setValueAtTime(0, at);
      master.gain.linearRampToValueAtTime(shape.volume, at + 0.012);
      master.gain.setValueAtTime(shape.volume, at + shape.beat - 0.03);
      master.gain.linearRampToValueAtTime(0, at + shape.beat - 0.008);
      at += shape.beat;
    }
    at += shape.beat * 0.6; // gap between cycles
  }

  oscillator.start(start);
  oscillator.stop(at + 0.05);

  const stop = () => {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
      oscillator.stop(ctx.currentTime);
    } catch {
      // Already stopped; nothing to undo.
    }
    oscillator.disconnect();
    master.disconnect();
    if (stopCurrent === stop) stopCurrent = null;
  };

  oscillator.onended = () => {
    if (stopCurrent === stop) stopCurrent = null;
  };

  stopCurrent = stop;
  return stop;
}

export function stopAlarm(): void {
  stopCurrent?.();
  stopCurrent = null;
}

export function alarmSounding(): boolean {
  return stopCurrent !== null;
}
