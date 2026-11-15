// @vitest-environment happy-dom
//
// Progress widgets: (1) bi-weekly sessions must not count in their off
// weeks, (2) day-rollover prop re-renders the memo'd widgets.
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { ConsistencyHeatmap } from "@/components/progress/Heatmap";
import { MomentumChart } from "@/components/progress/MomentumChart";
import { WeekRhythm } from "@/components/progress/WeekRhythm";
import { planForWeek } from "@/lib/workoutData";
import { weekKey, sessionKey, isSessionScheduled } from "@/lib/helpers";
import type { CompletionRecord } from "@/types/workout";

// Sunday 2026-11-15: the bi-weekly session is OFF this week.
const SUNDAY = new Date(2026, 10, 15, 12, 0, 0);

function allScheduledDone(): CompletionRecord {
  const out: CompletionRecord = {};
  for (let i = 0; i < 10; i++) {
    const d = new Date(SUNDAY);
    d.setDate(d.getDate() - i * 7);
    const wk = weekKey(d);
    for (const day of planForWeek(wk)) {
      for (const s of day.sessions) {
        if (isSessionScheduled(s, wk)) out[sessionKey(wk, day.day, s)] = true;
      }
    }
  }
  return out;
}

describe("progress widgets and bi-weekly sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SUNDAY);
  });
  afterEach(() => vi.useRealTimers());

  it("Heatmap: a fully done week reads 100% even in a bi-weekly off week", () => {
    const { container } = render(<ConsistencyHeatmap completions={allScheduledDone()} />);
    const footers = Array.from(container.querySelectorAll(".tabular-nums")).map((e) => e.textContent);
    expect(footers).toEqual(Array(8).fill("100%"));
  });

  it("MomentumChart: current week reads 100% when everything scheduled is done", () => {
    const { container } = render(<MomentumChart completions={allScheduledDone()} />);
    expect(container.querySelector(".font-display")?.textContent).toBe("100%");
  });
});

describe("progress widgets re-render on day rollover", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SUNDAY);
  });
  afterEach(() => vi.useRealTimers());

  it("Heatmap picks up the new week when the today key changes", () => {
    const completions = {};
    const { container, rerender } = render(<ConsistencyHeatmap completions={completions} todayKey="2026-11-15" />);
    const before = container.querySelectorAll("[title]")[0].getAttribute("title");
    vi.setSystemTime(new Date(2026, 10, 22, 0, 5, 0));
    rerender(<ConsistencyHeatmap completions={completions} todayKey="2026-11-22" />);
    expect(container.querySelectorAll("[title]")[0].getAttribute("title")).not.toBe(before);
  });

  it("WeekRhythm marks the new day as today when the today key changes", () => {
    const props = { selectedDay: "Sunday", onSelectDay: () => {}, weekOffset: 0, onChangeWeek: () => {} };
    const { container, rerender } = render(<WeekRhythm {...props} todayKey="2026-11-15" />);
    const accent = () => Array.from(container.querySelectorAll('[role="tab"] span')).filter((s) => (s as HTMLElement).style.color === "var(--accent)").map((s) => s.textContent);
    expect(accent()).toEqual([]); // Sunday is selected, so it uses the primary color
    vi.setSystemTime(new Date(2026, 10, 16, 0, 5, 0));
    rerender(<WeekRhythm {...props} todayKey="2026-11-16" />);
    expect(accent()).toEqual(["Mon"]);
  });
});
