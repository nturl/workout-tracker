// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsistencyHeatmap } from "@/components/progress/Heatmap";

describe("ConsistencyHeatmap", () => {
  it("renders with empty completions", () => {
    render(<ConsistencyHeatmap completions={{}} />);
    expect(screen.getByText(/8-Week History/i)).toBeTruthy();
  });

  it("renders the legend", () => {
    render(<ConsistencyHeatmap completions={{}} />);
    expect(screen.getByText("Less")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
  });

  it("renders 56 cells (8 weeks x 7 days)", () => {
    const { container } = render(<ConsistencyHeatmap completions={{}} />);
    const cells = container.querySelectorAll("[title]");
    expect(cells.length).toBe(56);
  });

  it("shows percentage in cell title", () => {
    const { container } = render(<ConsistencyHeatmap completions={{}} />);
    const cells = container.querySelectorAll("[title]");
    // All cells should show 0% for empty completions
    const titles = Array.from(cells).map((c) => c.getAttribute("title"));
    expect(titles.every((t) => t?.includes("0%"))).toBe(true);
  });
});
