// @vitest-environment happy-dom
//
// Lane C (timer logic: CircuitTimer / RepTimer) bug-hunt tests.
// See notes/bugs/lane-c.md for full write-up and repro steps.
//
// NOTE: this repo's happy-dom test env does not expose window.localStorage,
// and zustand's `persist` middleware resolves its storage getter eagerly the
// first time the store module is evaluated (see createJSONStorage in
// zustand/esm/middleware.mjs) - a stub assigned after that module has
// already been statically imported is too late. So every module that
// transitively imports useWorkoutStore is imported dynamically, after the
// localStorage stub is installed, instead of via top-level static imports.
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { CircuitExercise } from "@/lib/workoutData";

// The mock sentinel accepts the onRelease callback the real audio.ts
// requestWakeLock() now wires (BUG-16 fix) and exposes it as `__fireRelease`
// so tests can simulate the OS/browser silently revoking the lock (the real
// trigger for a sentinel's own 'release' event) without depending on a
// document.visibilitychange toggle, which the Wake Lock API does not itself
// fire release events from.
const requestWakeLockMock = vi.hoisted(() =>
  vi.fn(async (onRelease?: () => void) => {
    const sentinel = {
      release: vi.fn(async () => {}),
      addEventListener: vi.fn((type: string, cb: () => void) => {
        if (type === "release") (sentinel as unknown as { __fireRelease: () => void }).__fireRelease = cb;
      }),
    } as { release: () => Promise<void>; addEventListener: (type: string, cb: () => void) => void; __fireRelease?: () => void };
    if (onRelease) sentinel.addEventListener("release", onRelease);
    return sentinel;
  })
);

// Audio/haptics are not the point of this lane; stub them so the drift-free
// clock (real, unmocked) can be driven deterministically with fake timers.
// requestWakeLock/releaseWakeLock stay wired through the mock so wake-lock
// call counts can be asserted per test.
vi.mock("@/lib/audio", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audio")>("@/lib/audio");
  return {
    ...actual,
    unlockAudio: vi.fn(),
    playWorkStart: vi.fn(),
    playRestStart: vi.fn(),
    playBilateralSwitch: vi.fn(),
    playCountdown: vi.fn(),
    playCircuitComplete: vi.fn(),
    playRepTick: vi.fn(),
    playSetComplete: vi.fn(),
    playCountdownIntro: vi.fn(),
    vibrateRep: vi.fn(),
    vibrateSetComplete: vi.fn(),
    requestWakeLock: requestWakeLockMock,
    releaseWakeLock: vi.fn(async () => {}),
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
let CountdownIntro: typeof import("@/components/tracking/CountdownIntro")["CountdownIntro"];
let useWorkoutStore: typeof import("@/hooks/useWorkoutStore")["useWorkoutStore"];
let DEFAULT_TIMER_SETTINGS: typeof import("@/hooks/useWorkoutStore")["DEFAULT_TIMER_SETTINGS"];

beforeAll(async () => {
  installLocalStorageStub();
  ({ CircuitTimer } = await import("@/components/tracking/CircuitTimer"));
  ({ RepTimer } = await import("@/components/tracking/RepTimer"));
  ({ CountdownIntro } = await import("@/components/tracking/CountdownIntro"));
  ({ useWorkoutStore, DEFAULT_TIMER_SETTINGS } = await import("@/hooks/useWorkoutStore"));
});

const EXERCISES: CircuitExercise[] = [
  { name: "Jumping Jacks", workSeconds: 20, restSeconds: 10 },
  { name: "Push-ups", workSeconds: 20, restSeconds: 10 },
];

beforeEach(() => {
  requestWakeLockMock.mockClear();
  useWorkoutStore.setState({ timerSettings: { ...DEFAULT_TIMER_SETTINGS } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BUG-C1: CircuitTimer never requests a screen wake lock", () => {
  // src/components/tracking/CircuitTimer.tsx has zero references to
  // requestWakeLock/releaseWakeLock (confirmed by full read + grep), even
  // though timerSettings.wakeLock defaults to true (useWorkoutStore.ts:22-27)
  // and RepTimer.tsx:107-115,199-202 implements the same setting. A running
  // circuit (Tabata, VO2 4x4, functional-fitness) never keeps the screen
  // awake regardless of the "Keep screen awake" setting.
  it("BUG-C1: starting and running a circuit never calls requestWakeLock", async () => {
    vi.useFakeTimers();
    render(<CircuitTimer exercises={EXERCISES} />);

    const startBtn = screen.getByLabelText("Start timer");
    act(() => startBtn.click());
    // CountdownIntro default is 6s, then the circuit's first work phase runs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(requestWakeLockMock).toHaveBeenCalled();
  });
});

describe("BUG-C2: RepTimer's wake-lock re-acquire-on-visible path is dead code", () => {
  // RepTimer.tsx:106-115 re-requests a wake lock on visibilitychange only
  // when `!wakeLockRef.current`. The sentinel objects returned by the Screen
  // Wake Lock API fire their own 'release' event when the OS/browser
  // auto-releases the lock (e.g. on backgrounding), but requestWakeLock()
  // (src/lib/audio.ts:267-274) never attaches a 'release' listener and
  // RepTimer never nulls wakeLockRef.current on that event. So once acquired,
  // wakeLockRef.current stays truthy forever (until pause/reset/unmount),
  // and the "re-acquire on visible" branch can never actually fire, even
  // across many hide/show cycles.
  // NOTE (fix-s2): the original version of this test only toggled
  // document.visibilityState and asserted the sentinel's addEventListener
  // stayed undefined - but the Wake Lock API doesn't fire 'release' from a
  // plain visibilitychange toggle, it fires 'release' on the sentinel itself
  // when the OS/browser revokes the lock. That meant the test could never
  // have exercised the real fix (requestWakeLock() wiring a 'release'
  // listener - audio.ts). Rewritten to simulate the sentinel's own 'release'
  // event directly, which is what actually nulls wakeLockRef.current and lets
  // the "re-acquire on visible" branch fire again.
  it("BUG-C2: the wake-lock sentinel is given a release listener, and losing the lock lets the re-acquire-on-visible path fire again", async () => {
    vi.useFakeTimers();
    render(<RepTimer protocol={{ upSeconds: 10, downSeconds: 10, targetReps: 3, toFailure: false }} />);

    const startBtn = screen.getByLabelText("Start rep timer");
    await act(async () => {
      startBtn.click();
    });
    // CountdownIntro (6s) then beginTimer() fires requestWakeLock via start().
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(requestWakeLockMock).toHaveBeenCalledTimes(1);
    const sentinel1 = await requestWakeLockMock.mock.results[0].value;
    expect(sentinel1.addEventListener).toHaveBeenCalledWith("release", expect.any(Function));

    // Simulate the OS/browser silently revoking the lock (e.g. on
    // backgrounding) by firing the sentinel's own 'release' event.
    await act(async () => {
      sentinel1.__fireRelease?.();
    });

    // Foreground the tab: the re-acquire guard should now fire since
    // wakeLockRef.current was nulled by the release listener.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requestWakeLockMock).toHaveBeenCalledTimes(2);

    // Repeat once more to prove this isn't a one-shot fluke.
    const sentinel2 = await requestWakeLockMock.mock.results[1].value;
    await act(async () => {
      sentinel2.__fireRelease?.();
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requestWakeLockMock).toHaveBeenCalledTimes(3);
  });
});

describe("BUG-C3: two SessionCard-mounted CircuitTimers can run concurrently with no mutual exclusion", () => {
  // SessionCard.tsx:322-323 renders CircuitTimer/RepTimer inside a div with
  // the `hidden` attribute (not a conditional unmount) whenever a card is
  // collapsed, and WorkoutsTab.tsx:242 passes showTimer={true} unconditionally
  // for every card in the list. Neither CircuitTimer.tsx nor RepTimer.tsx
  // reads any "am I visible/expanded" signal (grep confirms no such prop or
  // effect), and there is no app-level singleton preventing two instances
  // from running at once. So a user can start one workout's circuit, collapse
  // that card (timer keeps ticking, hidden), expand a second session, and
  // start its circuit too - both run and beep independently.
  // NOTE (fix-s2): the original version of this test waited for BOTH
  // CircuitTimer instances' independent 6s CountdownIntro clocks to converge
  // under a single shared fake-timer/rAF environment and compared rendered
  // phase-chip text. That convergence turned out not to be reliable for a
  // second, concurrently-mounted instance (confirmed even for a solo second
  // render in isolation) - a test-harness limitation, not a fact about the
  // app's mutual-exclusion behavior one way or the other. Rewritten to assert
  // the actual mutual-exclusion mechanism directly and deterministically: the
  // moment a second timer is started, the first timer's play/pause control
  // must flip back to "not running", with no dependence on either instance's
  // countdown clock finishing.
  it("BUG-C3: starting a new timer immediately pauses any other timer already running", async () => {
    vi.useFakeTimers();
    const { container: containerA } = render(<CircuitTimer exercises={EXERCISES} />);
    const startA = containerA.querySelector('button[aria-label="Start timer"]') as HTMLButtonElement;
    // togglePause is async (it awaits requestWakeLock before claiming the
    // active-timer slot / showing the countdown - BUG-06 fix), so the click
    // must be awaited inside act: a bare sync act(() => btn.click()) leaves
    // that continuation (and the rAF-driven CountdownIntro clock it
    // triggers) unresolved outside any act/fake-timer flush boundary, which
    // stalls the countdown entirely under fake timers.
    await act(async () => {
      startA.click();
    });
    await act(async () => {
      // CountdownIntro's own 6s count plus its 350ms "GO" flash delay before
      // firing onComplete - see CountdownIntro.tsx's goTimeout.
      await vi.advanceTimersByTimeAsync(6500); // clear the countdown intro; A is now running
    });
    expect(containerA.querySelector('button[aria-label="Pause"]')).toBeTruthy();

    // "Collapse" card A the way SessionCard does: CSS-hide the wrapper, but
    // do NOT unmount - the component tree (and its running clock) survives.
    containerA.parentElement?.setAttribute("hidden", "");

    // Mount and start a second, independent CircuitTimer (card B expanded).
    const { container: containerB } = render(<CircuitTimer exercises={EXERCISES} />);
    const startB = containerB.querySelector('button[aria-label="Start timer"]') as HTMLButtonElement;
    await act(async () => {
      startB.click();
    });

    // Starting B should force A to stop immediately - no mutual-exclusion
    // bug. A's control reverts from "Pause" to "Start timer" without needing
    // any further time to pass.
    expect(containerA.querySelector('button[aria-label="Pause"]')).toBeFalsy();
    expect(containerA.querySelector('button[aria-label="Start timer"]')).toBeTruthy();
  });

  it("BUG-C3: collapsing a SessionCard (active=false) pauses its running timer", async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CircuitTimer exercises={EXERCISES} active={true} />);
    const start = container.querySelector('button[aria-label="Start timer"]') as HTMLButtonElement;
    await act(async () => {
      start.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6500);
    });
    expect(container.querySelector('button[aria-label="Pause"]')).toBeTruthy();

    // Simulate SessionCard collapsing: active flips to false.
    act(() => {
      rerender(<CircuitTimer exercises={EXERCISES} active={false} />);
    });

    expect(container.querySelector('button[aria-label="Pause"]')).toBeFalsy();
    expect(container.querySelector('button[aria-label="Start timer"]')).toBeTruthy();
  });
});

describe("BUG-C4: CountdownIntro restarts from the full duration if timerSettings identity changes mid-count", () => {
  // CountdownIntro.tsx's clock-setup effect (lines ~31-59) depends on
  // [seconds, timerSettings.audio, timerSettings.haptics]. WorkoutsTab stays
  // mounted across tab switches (src/app/page.tsx:86-95) specifically so a
  // running timer survives a peek at another tab. If the store's
  // timerSettings object identity changes while the 3-2-1 intro is showing
  // (setTimerSettings always replaces the whole object -
  // useWorkoutStore.ts:290), the effect tears down and recreates the clock
  // with `durationSeconds: seconds` (the original constant), not the
  // remaining time - so the on-screen count jumps back up instead of
  // continuing to count down.
  it("BUG-C4: toggling an unrelated timer setting mid-countdown resets the displayed count upward", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<CountdownIntro seconds={6} onComplete={onComplete} />);

    // Let ~3 seconds elapse: count should have dropped from 6 towards 3-4.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const midCount = Number(screen.getByText(/^[0-9]$/).textContent);
    expect(midCount).toBeLessThan(6);

    // Simulate an unrelated settings write elsewhere in the (still-mounted)
    // app - e.g. the user flips haptics in Settings while a workout timer
    // they started earlier is mid-countdown in the background.
    act(() => {
      const current = useWorkoutStore.getState().timerSettings;
      useWorkoutStore.getState().setTimerSettings({ ...current, haptics: !current.haptics });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    const afterToggleCount = Number(screen.getByText(/^[0-9]$/).textContent);

    // Correct behavior: the count keeps counting down (afterToggleCount
    // should be <= midCount). The bug instead recreates the clock with the
    // original 6s duration, so the display jumps back up.
    expect(afterToggleCount).toBeLessThanOrEqual(midCount);
  });
});
