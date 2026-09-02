// @vitest-environment happy-dom
//
// Lane D (timer UI / design-system contract) bug-hunt tests.
// See notes/bugs/lane-d.md for full write-up and repro steps.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { RepTimer } from "@/components/tracking/RepTimer";

// audio/haptics/wake-lock side effects aren't the point of this lane; stub
// them out so the timer clocks can be driven deterministically with fake
// timers (matches the pattern other timer tests in this repo use).
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
    requestWakeLock: vi.fn(async () => null),
    releaseWakeLock: vi.fn(async () => {}),
  };
});

describe("BUG-D1: ticking countdown digits use font-display (Space Grotesk), contradicting the app's own tabular-nums policy", () => {
  // src/app/layout.tsx:9-11 documents the policy explicitly:
  //   "Display face for headings, wordmark, and phase labels. Numerals stay
  //   Inter (tabular-nums) - Space Grotesk has no tabular figures, so
  //   countdowns would jiggle."
  // RepTimer's per-second phaseSecondsLeft readout ignores that policy: it
  // pairs tabular-nums with font-display, so the countdown digits will jiggle
  // in width every tick despite the tabular-nums class being present.

  it("BUG-D1a: RepTimer's live countdown number does not carry font-display", async () => {
    vi.useFakeTimers();
    try {
      render(<RepTimer protocol={{ upSeconds: 10, downSeconds: 10, targetReps: 3, toFailure: false }} />);

      // Start the set: idle -> countdown intro -> "up" phase.
      // RepTimer's start() is async (it awaits requestWakeLock before
      // showing the countdown), so the click must be awaited inside act -
      // a bare sync act(() => btn.click()) leaves that promise's
      // continuation (and the CountdownIntro mount + its rAF-driven clock
      // it triggers) unresolved outside any act/fake-timer flush boundary,
      // which stalls the countdown's clock entirely under fake timers.
      const startBtn = screen.getByLabelText("Start rep timer");
      await act(async () => {
        startBtn.click();
      });
      // CountdownIntro runs a 6s intro before RepTimer's own clock starts.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7000);
      });

      const phaseNumber = screen.getByText(/^(10|9|8)$/);
      expect(phaseNumber.className).not.toContain("font-display");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("BUG-D2: BottomNav pressed state has no non-touch release path (`:active`-only, no `touch-action`)", () => {
  // Documented as a repro-only finding in the report (needs a real touch
  // device / browser to observe the stuck-highlight); no reliable jsdom/
  // happy-dom assertion distinguishes ":active" from a real touch release,
  // so this is intentionally left uncovered by an automated test. See
  // notes/bugs/lane-d.md finding 6.
  it.skip("left as a manual/browser-lane repro", () => {});
});

describe("BUG-D3/BUG-24: CircuitTimer/RepTimer card background carried a hardcoded var() fallback hex that matched neither theme token", () => {
  // See notes/bugs/lane-d.md finding 3 - happy-dom serializes the inline
  // style back out as `background: rgb(...)`/computed value rather than the
  // literal source text, so this was never reliably assertable in jsdom/
  // happy-dom either way. Fixed (fix-s2, BUG-24) by direct source edit:
  // CircuitTimer.tsx and RepTimer.tsx now use bare `var(--timer-bg)` with no
  // fallback, since globals.css:19,60 always define --timer-bg for both
  // themes and the old `#1a1a2e` fallback matched neither.
  it.skip("left as a source-level trace finding, not testable through the DOM", () => {});
});
