// @vitest-environment happy-dom
//
// "Week complete" push must only fire for the current week, not for an old
// fully complete week the user pages back to.
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const notifyWeekComplete = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pushNotify", () => ({
  notifySessionComplete: vi.fn(),
  notifyWeekComplete,
  maybeNotifyStreakMilestone: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: null }) }));

import { WorkoutsTab } from "@/components/tabs/WorkoutsTab";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import { planForWeek } from "@/lib/workoutData";
import { weekKeyForOffset, sessionKey, isSessionScheduled } from "@/lib/helpers";

describe("WorkoutsTab week-complete push", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
    notifyWeekComplete.mockClear();
    const wk = weekKeyForOffset(-1);
    const completions: Record<string, boolean> = {};
    for (const day of planForWeek(wk)) {
      for (const s of day.sessions) if (isSessionScheduled(s, wk)) completions[sessionKey(wk, day.day, s)] = true;
    }
    useWorkoutStore.setState({ completions, mounted: true });
  });
  afterEach(() => vi.useRealTimers());

  it("does not push when paging back to a past, fully complete week", async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <WorkoutsTab syncStatus="idle" syncNow={() => {}} onOpenRecovery={() => {}} />
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Previous week"));
    });
    expect(notifyWeekComplete).not.toHaveBeenCalled();
  });
});
