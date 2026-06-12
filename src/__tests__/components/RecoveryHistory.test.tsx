// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecoveryHistory } from "@/components/recovery/RecoveryHistory";
import type { RecoveryData } from "@/types/workout";

// Helper: build a date key N days ago
function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("RecoveryHistory", () => {
  it("returns null when given empty data", () => {
    const { container } = render(<RecoveryHistory data={{}} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when data has entries but no metric values", () => {
    const data: RecoveryData = {
      [daysAgoKey(1)]: { date: daysAgoKey(1) },
    };
    const { container } = render(<RecoveryHistory data={data} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders 14-Day Trends heading when data has values", () => {
    const data: RecoveryData = {
      [daysAgoKey(1)]: {
        date: daysAgoKey(1),
        oura: { readinessScore: 85, hrv: 55, rhr: 52 },
      },
    };
    render(<RecoveryHistory data={data} />);
    expect(screen.getByText("14-Day Trends")).toBeTruthy();
  });

  it("renders bars for valid entries (TrendChart)", () => {
    const data: RecoveryData = {};
    for (let i = 0; i < 5; i++) {
      const key = daysAgoKey(i);
      data[key] = {
        date: key,
        oura: { readinessScore: 70 + i * 5, hrv: 40 + i * 5, rhr: 55 - i },
      };
    }
    const { container } = render(<RecoveryHistory data={data} />);
    // Each TrendChart renders a set of bars; there should be bar elements with non-trivial height
    const bars = container.querySelectorAll(".rounded-t-sm");
    expect(bars.length).toBeGreaterThan(0);
  });

  it("extractMetric prioritizes Oura over Eight Sleep", () => {
    const key = daysAgoKey(1);
    const data: RecoveryData = {
      [key]: {
        date: key,
        oura: { readinessScore: 90 },
        eightSleep: { sleepFitnessScore: 75 },
      },
    };
    render(<RecoveryHistory data={data} />);
    // The Oura source badge should appear
    expect(screen.getByText("Oura")).toBeTruthy();
  });

  it("shows Eight Sleep badge when only Eight Sleep data present", () => {
    const key = daysAgoKey(1);
    const data: RecoveryData = {
      [key]: {
        date: key,
        eightSleep: { sleepFitnessScore: 80, hrv: 45, rhr: 58 },
      },
    };
    render(<RecoveryHistory data={data} />);
    expect(screen.getByText("Eight Sleep")).toBeTruthy();
  });
});
