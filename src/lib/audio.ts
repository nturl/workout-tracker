// Web Audio + haptics + wake lock helpers.
// All functions are no-ops on the server and degrade gracefully if APIs are unavailable.

let ctx: AudioContext | null = null;
let visibilityBound = false;

function bindVisibilityResume(): void {
  // iOS Safari suspends the AudioContext when the tab is backgrounded and
  // does not auto-resume on return. Without this, the timer appears to freeze
  // and subsequent beeps never fire. Bind once per session; the listener is
  // cheap and idempotent.
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  });
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    bindVisibilityResume();
    return ctx;
  } catch {
    return null;
  }
}

// iOS Safari requires audio context to be unlocked from a user gesture handler.
// Call this from every user interaction that may precede a beep (start, resume,
// skip) since backgrounding can resuspend the context between gestures.
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }
}

// iOS Safari also suspends an AudioContext after a stretch of silence (e.g. the
// 237s gap between work-phase start and the 3-2-1 countdown in a VO2 4x4 round),
// without firing visibilitychange. Call this from the clock loop and from every
// beep to keep the context live without waiting for the next user gesture.
function ensureAudioActive(): void {
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

// ── Drift-free countdown clock ─────────────────────────────────
// V20: Replaces setInterval(1000) tick loops in RepTimer/CircuitTimer/
// CountdownIntro. The audio clock (or performance.now fallback) is the
// source of truth; secondsLeft is re-derived every animation frame so
// wall-clock drift cannot accumulate. Beeps/visual stay in lockstep.

export interface ClockTick {
  /** Integer seconds remaining, counts down to 0. */
  secondsLeft: number;
  /** Monotonic seconds elapsed since start (or since last resume baseline). */
  elapsedSeconds: number;
}

export interface ClockController {
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

interface ClockOptions {
  /** Total duration in seconds. */
  durationSeconds: number;
  /** Fires once per integer-second boundary (including the initial tick at mount). */
  onTick?: (tick: ClockTick) => void;
  /** Fires when secondsLeft hits 0. */
  onComplete?: () => void;
  /** Optional: fires on every animation frame for smooth visual updates. */
  onFrame?: (tick: ClockTick) => void;
}

function nowSeconds(): number {
  // performance.now() is monotonic and, unlike AudioContext.currentTime, keeps
  // advancing when the tab is backgrounded on iOS Safari. Previously we used
  // ctx time which froze whenever Safari suspended the context, leaving the
  // countdown stuck when the user switched apps and came back.
  if (typeof performance !== "undefined") return performance.now() / 1000;
  return Date.now() / 1000;
}

export function startCountdownClock(opts: ClockOptions): ClockController {
  const { durationSeconds } = opts;
  let baselineNow = nowSeconds();
  let elapsedBeforePause = 0;
  let running = true;
  let stopped = false;
  let lastEmittedSecondsLeft = durationSeconds + 1; // force initial emit
  let rafHandle: number | null = null;

  const currentElapsed = () => elapsedBeforePause + (running ? nowSeconds() - baselineNow : 0);

  const scheduleFrame = () => {
    if (typeof requestAnimationFrame === "function") {
      rafHandle = requestAnimationFrame(frame);
    } else {
      rafHandle = setTimeout(frame, 16) as unknown as number;
    }
  };

  const frame = () => {
    if (stopped || !running) return;
    const elapsedSeconds = currentElapsed();
    const secondsLeft = Math.max(0, durationSeconds - Math.floor(elapsedSeconds));
    const tick: ClockTick = { secondsLeft, elapsedSeconds };

    opts.onFrame?.(tick);

    if (secondsLeft !== lastEmittedSecondsLeft) {
      lastEmittedSecondsLeft = secondsLeft;
      ensureAudioActive();
      opts.onTick?.(tick);
    }

    if (secondsLeft <= 0) {
      stopped = true;
      opts.onComplete?.();
      return;
    }

    scheduleFrame();
  };

  scheduleFrame();

  return {
    pause: () => {
      if (!running || stopped) return;
      elapsedBeforePause += nowSeconds() - baselineNow;
      running = false;
    },
    resume: () => {
      if (running || stopped) return;
      baselineNow = nowSeconds();
      running = true;
      scheduleFrame();
    },
    stop: () => {
      stopped = true;
      if (rafHandle !== null) {
        if (typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(rafHandle);
        } else {
          clearTimeout(rafHandle);
        }
      }
    },
    isRunning: () => running && !stopped,
  };
}

interface BeepOptions {
  frequency: number;
  durationMs: number;
  volume?: number;
  type?: OscillatorType;
}

function beep({ frequency, durationMs, volume = 0.25, type = "sine" }: BeepOptions): void {
  const c = getCtx();
  if (!c) return;
  ensureAudioActive();
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(c.destination);
    const now = c.currentTime;
    osc.start(now);
    // Quick release to avoid clicks
    gain.gain.setValueAtTime(volume, now + durationMs / 1000 - 0.01);
    gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
    osc.stop(now + durationMs / 1000);
  } catch {
    // ignore
  }
}

// Short high beep on each rep phase boundary.
export function playRepTick(): void {
  beep({ frequency: 600, durationMs: 80 });
}

// Triple ascending beep on set complete.
export function playSetComplete(): void {
  const c = getCtx();
  if (!c) return;
  beep({ frequency: 400, durationMs: 120 });
  setTimeout(() => beep({ frequency: 600, durationMs: 120 }), 140);
  setTimeout(() => beep({ frequency: 800, durationMs: 200 }), 280);
}

// Low countdown tick at 3, 2, 1 seconds before phase end.
export function playCountdown(): void {
  beep({ frequency: 300, durationMs: 60, volume: 0.18 });
}

// Pre-start intro countdown: higher pitch + louder than in-phase ticks
// so "3, 2, 1, GO" feels distinct from the end-of-phase ticks.
export function playCountdownIntro(isGo: boolean): void {
  if (isGo) {
    beep({ frequency: 880, durationMs: 220, volume: 0.35 });
  } else {
    beep({ frequency: 520, durationMs: 140, volume: 0.3 });
  }
}

// Circuit transitions. Distinct pitches so work/rest/done are audible without
// looking at the screen.
export function playWorkStart(): void {
  beep({ frequency: 880, durationMs: 200, volume: 0.3 });
}

export function playRestStart(): void {
  beep({ frequency: 440, durationMs: 160, volume: 0.28 });
}

export function playBilateralSwitch(): void {
  beep({ frequency: 770, durationMs: 300, volume: 0.32 });
}

export function playCircuitComplete(): void {
  beep({ frequency: 880, durationMs: 500, volume: 0.35 });
}

// ── Haptics ─────────────────────────────────────────────────────

export function vibrateRep(): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") navigator.vibrate(50);
}

export function vibrateSetComplete(): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") navigator.vibrate([100, 50, 100, 50, 200]);
}

// ── Wake lock ───────────────────────────────────────────────────

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
}

export async function requestWakeLock(): Promise<WakeLockSentinelLike | null> {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as unknown as WakeLockNavigator;
  if (!nav.wakeLock) return null;
  try {
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}

export async function releaseWakeLock(sentinel: WakeLockSentinelLike | null): Promise<void> {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // ignore
  }
}
