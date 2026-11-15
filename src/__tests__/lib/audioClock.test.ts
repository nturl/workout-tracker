// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startCountdownClock } from "@/lib/audio";

// Manual clock + manual animation frames: time can jump without a frame
// running, which is what a hidden page / locked phone looks like.
let t = 0;
let pending: (() => void) | null = null;

function runFrame() {
  const cb = pending;
  pending = null;
  cb?.();
}

function setVisible() {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  t = 0;
  pending = null;
  vi.spyOn(performance, "now").mockImplementation(() => t * 1000);
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { pending = cb; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => { pending = null; });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("startCountdownClock hidden-page catch-up (BUG-35)", () => {
  it("reports the seconds past zero to onComplete", () => {
    const onComplete = vi.fn();
    startCountdownClock({ durationSeconds: 3, onComplete });
    t = 4.5;
    runFrame();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toBeCloseTo(1.5, 5);
  });

  it("reports ~0 overflow when frames run on time", () => {
    const onComplete = vi.fn();
    startCountdownClock({ durationSeconds: 2, onComplete });
    t = 2;
    runFrame();
    expect(onComplete.mock.calls[0][0]).toBeCloseTo(0, 5);
  });

  it("starts with initialElapsedSeconds already consumed", () => {
    const ticks: number[] = [];
    startCountdownClock({ durationSeconds: 10, initialElapsedSeconds: 3.5, onTick: (k) => ticks.push(k.secondsLeft) });
    runFrame();
    expect(ticks).toEqual([7]);
    t = 1;
    runFrame();
    expect(ticks).toEqual([7, 6]);
  });

  it("completes on visibilitychange without waiting for a frame", () => {
    const onComplete = vi.fn();
    startCountdownClock({ durationSeconds: 3, onComplete });
    t = 4.5;
    setVisible();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toBeCloseTo(1.5, 5);
    // The stale frame must not complete a second time.
    runFrame();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("a paused or stopped clock does not advance on visibilitychange", () => {
    const onComplete = vi.fn();
    const clock = startCountdownClock({ durationSeconds: 3, onComplete });
    t = 1;
    clock.pause();
    t = 100;
    setVisible();
    expect(onComplete).not.toHaveBeenCalled();
    clock.resume();
    t = 100.5;
    setVisible();
    expect(onComplete).not.toHaveBeenCalled();

    const stopped = vi.fn();
    const c2 = startCountdownClock({ durationSeconds: 1, onComplete: stopped });
    c2.stop();
    t = 500;
    setVisible();
    expect(stopped).not.toHaveBeenCalled();
  });
});
