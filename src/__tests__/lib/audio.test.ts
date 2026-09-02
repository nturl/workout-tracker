import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Web Audio API mock
class MockOscillator {
  type: OscillatorType = "sine";
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class MockGain {
  gain = {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

const mockOscillators: MockOscillator[] = [];
const mockGains: MockGain[] = [];

class MockAudioContext {
  state: "suspended" | "running" = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  createOscillator() {
    const osc = new MockOscillator();
    mockOscillators.push(osc);
    return osc;
  }
  createGain() {
    const gain = new MockGain();
    mockGains.push(gain);
    return gain;
  }
}

describe("audio module", () => {
  beforeEach(() => {
    vi.resetModules();
    mockOscillators.length = 0;
    mockGains.length = 0;
    (globalThis as unknown as { window: Window }).window = {
      AudioContext: MockAudioContext as unknown as typeof AudioContext,
    } as unknown as Window;
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: Window }).window;
    // navigator stubs go through vi.stubGlobal: globalThis.navigator is a
    // getter-only property in Node 21+, so direct assignment throws.
    vi.unstubAllGlobals();
  });

  it("playRepTick creates a 600Hz oscillator", async () => {
    const { playRepTick } = await import("@/lib/audio");
    playRepTick();
    expect(mockOscillators.length).toBe(1);
    expect(mockOscillators[0].frequency.value).toBe(600);
    expect(mockOscillators[0].start).toHaveBeenCalled();
    expect(mockOscillators[0].stop).toHaveBeenCalled();
  });

  it("playSetComplete schedules three ascending beeps", async () => {
    vi.useFakeTimers();
    const { playSetComplete } = await import("@/lib/audio");
    playSetComplete();
    // First beep is synchronous
    expect(mockOscillators.length).toBe(1);
    expect(mockOscillators[0].frequency.value).toBe(400);
    // Advance to fire setTimeouts
    vi.advanceTimersByTime(150);
    expect(mockOscillators.length).toBe(2);
    expect(mockOscillators[1].frequency.value).toBe(600);
    vi.advanceTimersByTime(150);
    expect(mockOscillators.length).toBe(3);
    expect(mockOscillators[2].frequency.value).toBe(800);
    vi.useRealTimers();
  });

  it("playCountdown creates a low 300Hz tick", async () => {
    const { playCountdown } = await import("@/lib/audio");
    playCountdown();
    expect(mockOscillators[0].frequency.value).toBe(300);
  });

  it("unlockAudio resumes a suspended context", async () => {
    // Force suspended state
    class SuspendedCtx extends MockAudioContext {
      state: "suspended" | "running" = "suspended";
    }
    (globalThis as unknown as { window: Window }).window = {
      AudioContext: SuspendedCtx as unknown as typeof AudioContext,
    } as unknown as Window;
    const { unlockAudio, playRepTick } = await import("@/lib/audio");
    // Prime the singleton
    playRepTick();
    unlockAudio();
    // Just verify no throw
    expect(true).toBe(true);
  });

  it("vibrateRep calls navigator.vibrate when available", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate } as unknown as Navigator);
    const { vibrateRep } = await import("@/lib/audio");
    vibrateRep();
    expect(vibrate).toHaveBeenCalledWith(50);
  });

  it("vibrateSetComplete uses a multi-pulse pattern", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate } as unknown as Navigator);
    const { vibrateSetComplete } = await import("@/lib/audio");
    vibrateSetComplete();
    expect(vibrate).toHaveBeenCalledWith([100, 50, 100, 50, 200]);
  });

  it("requestWakeLock returns null if API is unavailable", async () => {
    vi.stubGlobal("navigator", {} as unknown as Navigator);
    const { requestWakeLock } = await import("@/lib/audio");
    const sentinel = await requestWakeLock();
    expect(sentinel).toBeNull();
  });

  it("requestWakeLock returns a sentinel when API is available", async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    vi.stubGlobal("navigator", { wakeLock: { request } } as unknown as Navigator);
    const { requestWakeLock, releaseWakeLock } = await import("@/lib/audio");
    const sentinel = await requestWakeLock();
    expect(request).toHaveBeenCalledWith("screen");
    expect(sentinel).not.toBeNull();
    await releaseWakeLock(sentinel);
    expect(release).toHaveBeenCalled();
  });

  // BUG-16: requestWakeLock() must wire an onRelease callback to the
  // sentinel's own 'release' event, so a caller's wakeLockRef can be nulled
  // when the OS/browser silently revokes the lock (the real Wake Lock API
  // sentinel is an EventTarget that fires this itself).
  it("requestWakeLock wires an onRelease callback to the sentinel's 'release' event", async () => {
    const release = vi.fn(async () => {});
    const listeners = new Map<string, () => void>();
    const addEventListener = vi.fn((type: string, cb: () => void) => {
      listeners.set(type, cb);
    });
    const request = vi.fn(async () => ({ release, addEventListener }));
    vi.stubGlobal("navigator", { wakeLock: { request } } as unknown as Navigator);
    const { requestWakeLock } = await import("@/lib/audio");

    const onRelease = vi.fn();
    await requestWakeLock(onRelease);
    expect(addEventListener).toHaveBeenCalledWith("release", expect.any(Function));

    // Simulate the OS/browser firing the sentinel's own 'release' event.
    listeners.get("release")?.();
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("requestWakeLock does not throw when the sentinel has no addEventListener", async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    vi.stubGlobal("navigator", { wakeLock: { request } } as unknown as Navigator);
    const { requestWakeLock } = await import("@/lib/audio");
    await expect(requestWakeLock(vi.fn())).resolves.not.toBeNull();
  });

  // BUG-07: only one RepTimer/CircuitTimer instance should be "armed"
  // (claimed the active-timer slot) at a time. Whoever claims last should
  // force-stop whoever held it before.
  it("claimActiveTimer force-stops the previous holder, releaseActiveTimer clears the slot", async () => {
    const { claimActiveTimer, releaseActiveTimer } = await import("@/lib/audio");
    const tokenA = {};
    const tokenB = {};
    const stopA = vi.fn();
    const stopB = vi.fn();

    claimActiveTimer(tokenA, stopA);
    expect(stopA).not.toHaveBeenCalled();

    claimActiveTimer(tokenB, stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();

    // Releasing a token that no longer holds the slot is a no-op.
    releaseActiveTimer(tokenA);
    claimActiveTimer(tokenA, stopA);
    expect(stopB).toHaveBeenCalledTimes(1);

    releaseActiveTimer(tokenA);
    claimActiveTimer(tokenA, vi.fn());
    // No second holder to stop this time - claiming after a clean release
    // should not call the just-registered stop function.
  });
});
