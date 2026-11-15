// @vitest-environment happy-dom
//
// BUG-31..35: timer fixes (round-aware session completion, wake-lock
// lifecycle, no trailing rest, hidden-page catch-up).
//
// See lane-c.test.tsx for why the store-touching modules are imported
// dynamically after a localStorage stub is installed.
import React, { useState } from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type { CircuitExercise, WorkoutSession } from "@/lib/workoutData";
import type { WorkoutLogRecord, WorkoutLogEntry } from "@/types/workout";

const mocks = vi.hoisted(() => {
  const sentinels: Array<{ release: () => Promise<void>; __fireRelease?: () => void }> = [];
  return {
    sentinels,
    requestWakeLock: vi.fn(async (onRelease?: () => void) => {
      const sentinel: { release: () => Promise<void>; __fireRelease?: () => void } = {
        release: vi.fn(async () => {}),
      };
      sentinel.__fireRelease = () => onRelease?.();
      sentinels.push(sentinel);
      return sentinel;
    }),
    releaseWakeLock: vi.fn(async () => {}),
    playWorkStart: vi.fn(),
    playRestStart: vi.fn(),
    playRepTick: vi.fn(),
    playSetComplete: vi.fn(),
    playCircuitComplete: vi.fn(),
  };
});

vi.mock("@/lib/audio", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audio")>("@/lib/audio");
  return {
    ...actual,
    unlockAudio: vi.fn(),
    playWorkStart: mocks.playWorkStart,
    playRestStart: mocks.playRestStart,
    playBilateralSwitch: vi.fn(),
    playCountdown: vi.fn(),
    playCircuitComplete: mocks.playCircuitComplete,
    playRepTick: mocks.playRepTick,
    playSetComplete: mocks.playSetComplete,
    playCountdownIntro: vi.fn(),
    vibrateRep: vi.fn(),
    vibrateSetComplete: vi.fn(),
    requestWakeLock: mocks.requestWakeLock,
    releaseWakeLock: mocks.releaseWakeLock,
  };
});

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: stub, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true, writable: true });
}

let CircuitTimer: typeof import("@/components/tracking/CircuitTimer")["CircuitTimer"];
let RepTimer: typeof import("@/components/tracking/RepTimer")["RepTimer"];
let SessionCard: typeof import("@/components/dashboard/SessionCard")["SessionCard"];
let useWorkoutStore: typeof import("@/hooks/useWorkoutStore")["useWorkoutStore"];
let DEFAULT_TIMER_SETTINGS: typeof import("@/hooks/useWorkoutStore")["DEFAULT_TIMER_SETTINGS"];

beforeAll(async () => {
  installLocalStorageStub();
  ({ CircuitTimer } = await import("@/components/tracking/CircuitTimer"));
  ({ RepTimer } = await import("@/components/tracking/RepTimer"));
  ({ SessionCard } = await import("@/components/dashboard/SessionCard"));
  ({ useWorkoutStore, DEFAULT_TIMER_SETTINGS } = await import("@/hooks/useWorkoutStore"));
});

// Skew added on top of the fake-timer clock: simulates wall time that passes
// while the page is hidden / the phone is locked and rAF does not run.
let skewMs = 0;

function installClock() {
  vi.useFakeTimers();
  skewMs = 0;
  const base = performance.now.bind(performance);
  vi.spyOn(performance, "now").mockImplementation(() => base() + skewMs);
}

async function hideFor(seconds: number) {
  skewMs += seconds * 1000;
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

// Stepped: React only re-runs the clock effect between acts, so one big
// advance would stall on the first phase transition.
async function advance(ms: number, step = 250) {
  for (let left = ms; left > 0; left -= step) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(step, left));
    });
  }
}

async function click(label: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByLabelText(label));
  });
}

async function skipIntro() {
  await act(async () => {
    fireEvent.click(screen.getByLabelText("Skip countdown"));
  });
  // CountdownIntro delays onComplete 350ms after GO; skip calls it directly.
  await advance(50);
}

beforeEach(() => {
  mocks.sentinels.length = 0;
  Object.values(mocks).forEach((m) => { if (typeof m === "function") (m as ReturnType<typeof vi.fn>).mockClear(); });
  useWorkoutStore.setState({ timerSettings: { ...DEFAULT_TIMER_SETTINGS } });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const THREE: CircuitExercise[] = [
  { name: "A", workSeconds: 10, restSeconds: 5 },
  { name: "B", workSeconds: 10, restSeconds: 5 },
  { name: "C", workSeconds: 10, restSeconds: 5 },
];

describe("BUG-31: SessionCard completes the session only when the timer's final round finishes", () => {
  const session = {
    title: "Flat circuit",
    icon: "x",
    category: "strength",
    timeOfDay: "Morning",
    levels: {
      beginner: { instructions: "go", exercises: [{ name: "A (5s)" }, { name: "B (5s)" }] },
    },
  } as unknown as WorkoutSession;

  function Harness({ onToggle }: { onToggle: () => void }) {
    const [logs, setLogs] = useState<WorkoutLogRecord>({});
    return (
      <SessionCard
        session={session}
        level="beginner"
        completed={false}
        onToggle={onToggle}
        logKey="k"
        logs={logs}
        onOpenLog={() => {}}
        onSaveLog={(key: string, entry: WorkoutLogEntry) => setLogs((p) => ({ ...p, [key]: entry }))}
        showTimer={true}
      />
    );
  }

  it("2x rounds: finishing round 1 does not toggle; finishing round 2 toggles once", async () => {
    vi.useFakeTimers();
    const onToggle = vi.fn();
    const { container } = render(<Harness onToggle={onToggle} />);
    fireEvent.click(container.querySelector('[role="button"][aria-label*="details"]')!);
    fireEvent.click(screen.getByText("2x"));
    await click("Start timer");
    await skipIntro();

    const skip = () => click("Skip to next exercise");
    await skip(); // A, round 1
    await skip(); // B, round 1: every slug is now completed
    expect(onToggle).not.toHaveBeenCalled();
    await skip(); // A, round 2
    expect(onToggle).not.toHaveBeenCalled();
    await skip(); // B, round 2: circuit done
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("BUG-32: CircuitTimer re-requests the wake lock on resume after the OS revoked it", () => {
  it("pause -> lock revoked -> resume requests a fresh lock", async () => {
    vi.useFakeTimers();
    render(<CircuitTimer exercises={THREE} />);
    await click("Start timer");
    await skipIntro();
    expect(mocks.requestWakeLock).toHaveBeenCalledTimes(1);

    await click("Pause");
    // Released on pause (BUG-33); the OS revoking a lock fires its own release event too.
    mocks.sentinels[0].__fireRelease?.();
    await click("Start timer");
    expect(mocks.requestWakeLock).toHaveBeenCalledTimes(2);
  });
});

describe("BUG-33: the wake lock is only held while a timer is running", () => {
  it("CircuitTimer releases it on pause", async () => {
    vi.useFakeTimers();
    render(<CircuitTimer exercises={THREE} />);
    await click("Start timer");
    await skipIntro();
    mocks.releaseWakeLock.mockClear();
    await click("Pause");
    expect(mocks.releaseWakeLock).toHaveBeenCalledTimes(1);
  });

  it("RepTimer releases it on pause, on stop-set and when the set completes", async () => {
    installClock();
    const protocol = { upSeconds: 2, downSeconds: 2, targetReps: 1, toFailure: false };
    render(<RepTimer protocol={protocol} />);
    await click("Start rep timer");
    await skipIntro();

    mocks.releaseWakeLock.mockClear();
    await click("Pause rep timer");
    expect(mocks.releaseWakeLock).toHaveBeenCalledTimes(1);

    await click("Start rep timer"); // resume: re-acquires
    expect(mocks.requestWakeLock).toHaveBeenCalledTimes(2);
    mocks.releaseWakeLock.mockClear();
    await click("Mark set complete");
    expect(mocks.releaseWakeLock).toHaveBeenCalledTimes(1);

    // Natural completion: restart, then let the single rep run out.
    await click("Restart rep timer");
    await skipIntro();
    mocks.releaseWakeLock.mockClear();
    await advance(5000);
    expect(screen.getByText("Set complete")).toBeTruthy();
    expect(mocks.releaseWakeLock).toHaveBeenCalledTimes(1);
  });
});

describe("BUG-34: CircuitTimer has no trailing rest after the final exercise of the final round", () => {
  it("finishes at the end of the last work phase and the shown total matches", async () => {
    installClock();
    render(<CircuitTimer exercises={THREE} />);
    // 3 x (10 work + 5 rest) minus the trailing 5 rest = 40s.
    expect(screen.getByText("40")).toBeTruthy();

    await click("Start timer");
    await skipIntro();
    // Real time is 40s; the slack covers the test's own per-step effect lag.
    // (Before the fix the trailing 5s rest made it 45s.)
    await advance(41_500, 50);
    expect(screen.getByText("Circuit complete")).toBeTruthy();
  });
});

describe("BUG-35: hidden-page time is not lost", () => {
  it("CircuitTimer lands in the phase the real clock is in, once per skipped exercise, cueing only the landing phase", async () => {
    installClock();
    const onExerciseComplete = vi.fn();
    render(<CircuitTimer exercises={THREE} onExerciseComplete={onExerciseComplete} />);
    await click("Start timer");
    await skipIntro();
    await advance(3000);
    expect(mocks.playWorkStart).toHaveBeenCalledTimes(1);

    // Real elapsed in the circuit ~27.5s: A (0-15) done, B work (15-25) done, B rest (25-30) at 2.5s in.
    await hideFor(24.5);
    expect(onExerciseComplete).toHaveBeenCalledTimes(1);
    expect(onExerciseComplete).toHaveBeenCalledWith(0, false);
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.getByText("Rest")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(mocks.playWorkStart).toHaveBeenCalledTimes(1);
    expect(mocks.playRestStart).toHaveBeenCalledTimes(1);
  });

  it("CircuitTimer finishes if the whole circuit elapsed while hidden", async () => {
    installClock();
    const onExerciseComplete = vi.fn();
    render(<CircuitTimer exercises={THREE} onExerciseComplete={onExerciseComplete} />);
    await click("Start timer");
    await skipIntro();
    await advance(3000);
    await hideFor(600);
    expect(screen.getByText("Circuit complete")).toBeTruthy();
    expect(onExerciseComplete.mock.calls).toEqual([[0, false], [1, false], [2, true]]);
    expect(mocks.playCircuitComplete).toHaveBeenCalledTimes(1);
    expect(mocks.playRestStart).not.toHaveBeenCalled();
  });

  it("a paused CircuitTimer does not advance when the page returns", async () => {
    installClock();
    const onExerciseComplete = vi.fn();
    render(<CircuitTimer exercises={THREE} onExerciseComplete={onExerciseComplete} />);
    await click("Start timer");
    await skipIntro();
    await advance(3000);
    await click("Pause");
    await hideFor(600);
    expect(onExerciseComplete).not.toHaveBeenCalled();
    expect(screen.queryByText("Circuit complete")).toBeNull();
  });

  it("RepTimer credits TUT by elapsed seconds and lands in the right rep/phase with one cue", async () => {
    installClock();
    const protocol = { upSeconds: 5, downSeconds: 5, targetReps: 3, toFailure: false };
    render(<RepTimer protocol={protocol} />);
    await click("Start rep timer");
    await skipIntro();
    expect(mocks.playRepTick).toHaveBeenCalledTimes(1);
    await advance(2000);

    // Rep 1 (0-10) done, rep 2 up (10-15) done, rep 2 down 4.5s in.
    await hideFor(17.5);
    expect(screen.getByText("Rep 2 of 3")).toBeTruthy();
    expect(screen.getAllByText("DOWN").length).toBeGreaterThan(0);
    expect(screen.getByText("TUT 0:19")).toBeTruthy();
    expect(mocks.playRepTick).toHaveBeenCalledTimes(2);
  });

  it("RepTimer completes the set, with every rep counted, if the set ran out while hidden", async () => {
    installClock();
    const onComplete = vi.fn();
    const protocol = { upSeconds: 5, downSeconds: 5, targetReps: 3, toFailure: false };
    render(<RepTimer protocol={protocol} onComplete={onComplete} />);
    await click("Start rep timer");
    await skipIntro();
    await advance(2000);
    await hideFor(600);
    expect(screen.getByText("Set complete")).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].reps).toBe(3);
    expect(mocks.playSetComplete).toHaveBeenCalledTimes(1);
  });
});
