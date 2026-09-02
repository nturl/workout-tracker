// @vitest-environment happy-dom
//
// BUG-30: midnight rollover.
//
// Root cause in one sentence: `WorkoutsTab.tsx:130` computed `const today =
// todayKey()` once per render, but nothing ever re-renders the tab purely
// because a clock crossed midnight, and `selectedDay` (`useWorkoutStore.ts:423`)
// is set once at store creation and otherwise only changes on a manual tap —
// so a tab left open overnight kept writing habit taps to yesterday's date
// key, the week strip stayed highlighted on yesterday, and `useSync.ts`'s
// deliberately quiet refetch policy (no window-focus/mount refetch, 5min
// staleTime, `useSync.ts:76-83`) meant it also never learned what another
// device wrote after midnight until the staleTime happened to lapse.
//
// Fix: `useTodayKey` (src/hooks/useTodayKey.ts) makes "what day is it" a
// reactive value — re-checked on a 30s interval and on visibilitychange/
// focus/pageshow — and `WorkoutsTab`/`useSync` both consume it instead of a
// bare `todayKey()` call.

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTodayKey } from "@/hooks/useTodayKey";
import { useSync } from "@/hooks/useSync";
import { useWorkoutStore, emptyDirty, seedDefaultHabits } from "@/hooks/useWorkoutStore";
import { todayKey } from "@/lib/helpers";

function resetStore() {
  useWorkoutStore.setState({
    completions: {},
    logs: {},
    level: "beginner",
    recoveryData: {},
    habits: {},
    habitDefs: seedDefaultHabits(),
    habitDefsVersion: 0,
    habitDefsDirty: false,
    dirty: emptyDirty(),
    habitFalseBackupV5: {},
    ouraLastSynced: null,
    eightSleepLastSynced: null,
  });
}

// A fixed instant just before midnight, local time, on an otherwise
// arbitrary date. Time zone doesn't matter here — todayKey() and this test
// both read the same local clock.
const BEFORE_MIDNIGHT = new Date(2026, 8, 1, 23, 59, 50); // 2026-09-01 23:59:50
const AFTER_MIDNIGHT = new Date(2026, 8, 2, 0, 0, 5); // 2026-09-02 00:00:05

describe("useTodayKey (BUG-30)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_MIDNIGHT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates on its 30s interval once the clock crosses midnight", async () => {
    const { result } = renderHook(() => useTodayKey());

    expect(result.current).toBe("2026-09-01");

    // Cross midnight, then let the 30s interval tick.
    await act(async () => {
      vi.setSystemTime(AFTER_MIDNIGHT);
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(result.current).toBe("2026-09-02");
  });

  it("updates immediately on visibilitychange when a backgrounded tab regains visibility after midnight", async () => {
    const { result } = renderHook(() => useTodayKey());
    expect(result.current).toBe("2026-09-01");

    // Simulate the tab being backgrounded across midnight: the clock moves,
    // but no interval tick has fired yet (e.g. iOS suspends timers in the
    // background).
    vi.setSystemTime(AFTER_MIDNIGHT);
    expect(result.current).toBe("2026-09-01"); // still stale — no tick, no event yet

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe("2026-09-02");
  });

  it("does not update on a visibilitychange while the tab is hidden", async () => {
    const { result } = renderHook(() => useTodayKey());
    vi.setSystemTime(AFTER_MIDNIGHT);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe("2026-09-01");
  });
});

// ---------------------------------------------------------------------------
// A tap after the rollover must write under the NEW day's key, not the day
// the tab happened to be opened on. Rather than mounting WorkoutsTab's full
// shell (Clerk/SessionCard/etc.), this exercises the same wiring
// WorkoutsTab.tsx now uses: `today` comes from `useTodayKey()`, and a
// "tap" writes to the store keyed by that live value (WorkoutsTab.tsx's
// `setToday`/`clearToday` closures do exactly this: `setHabit(id, today, ...)`).
// ---------------------------------------------------------------------------

function TapProbe({ habitId, onToday }: { habitId: string; onToday: (today: string) => void }) {
  const today = useTodayKey();
  const setHabit = useWorkoutStore((s) => s.setHabit);
  onToday(today);
  return (
    <button
      type="button"
      aria-label="tap"
      onClick={() => setHabit(habitId, today, true)}
    >
      tap
    </button>
  );
}

describe("a habit tap after rollover writes to the new day's key (BUG-30)", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_MIDNIGHT);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStore();
  });

  it("writes under yesterday's key before rollover, and today's key after", async () => {
    let latestToday = "";
    const { getByLabelText } = render(
      <TapProbe habitId="ash" onToday={(t) => { latestToday = t; }} />,
    );

    expect(latestToday).toBe("2026-09-01");
    act(() => { getByLabelText("tap").click(); });
    expect(useWorkoutStore.getState().habits.ash?.["2026-09-01"]).toBe(true);
    expect(useWorkoutStore.getState().habits.ash?.["2026-09-02"]).toBeUndefined();

    // Cross midnight and let the hook notice.
    await act(async () => {
      vi.setSystemTime(AFTER_MIDNIGHT);
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(latestToday).toBe("2026-09-02");

    act(() => { getByLabelText("tap").click(); });
    // The BUG-30 failure mode: this tap would still land on "2026-09-01"
    // because `today` was captured once at open-time and never refreshed.
    expect(useWorkoutStore.getState().habits.ash?.["2026-09-02"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useSync: an overnight-open tab must pick up whatever another device wrote
// after midnight, even though the bandwidth-diet settings (useSync.ts:76-83)
// deliberately skip refetch-on-focus and refetch-on-mount.
// ---------------------------------------------------------------------------

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useSync refetches once on the day rollover (BUG-30)", () => {
  let getCount: number;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_MIDNIGHT);
    getCount = 0;
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ habitDefs: [], habitDefsVersion: 1 }), { status: 200 });
      }
      getCount += 1;
      return new Response(JSON.stringify({ data: { updatedAt: getCount } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetStore();
  });

  it("issues a second GET once the day key changes after the initial hydrate", async () => {
    renderHook(() => useSync(true), { wrapper: makeWrapper() });

    // Flush the initial mount's queryFn (a plain resolved Promise, no real
    // delay) without relying on waitFor's own setTimeout-based polling,
    // which fake timers would otherwise leave stuck.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getCount).toBe(1);

    // Cross midnight and let useTodayKey's interval notice.
    await act(async () => {
      vi.setSystemTime(AFTER_MIDNIGHT);
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(getCount).toBe(2);
  });

  it("does not issue an extra GET on interval ticks that don't cross a day boundary", async () => {
    // Comfortably mid-day, unlike BEFORE_MIDNIGHT — a few 30s ticks here
    // shouldn't cross into the next day.
    vi.setSystemTime(new Date(2026, 8, 1, 12, 0, 0));

    renderHook(() => useSync(true), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getCount).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(getCount).toBe(1);
  });
});

// Sanity: todayKey() itself is what useTodayKey wraps — pinning the format
// it depends on so a helpers.ts change surfaces here too.
describe("todayKey format (sanity)", () => {
  it("is a local YYYY-MM-DD string", () => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_MIDNIGHT);
    expect(todayKey()).toBe("2026-09-01");
    vi.useRealTimers();
  });
});
