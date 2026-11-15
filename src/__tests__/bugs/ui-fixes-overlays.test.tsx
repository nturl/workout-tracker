// @vitest-environment happy-dom
//
// Sheet focus + LogModal save behavior.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sheet } from "@/components/ui/Sheet";
import { LogModal } from "@/components/tracking/LogModal";
import { weeklyPlan } from "@/lib/workoutData";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

describe("Sheet focus", () => {
  it("does not steal focus back to Close when the parent re-renders with a new onClose", async () => {
    const ui = (onClose: () => void) => (
      <Sheet open onClose={onClose} title="T">
        <textarea aria-label="notes" />
      </Sheet>
    );
    const { rerender } = render(ui(() => {}));
    await frame();
    expect(document.activeElement).toBe(screen.getByLabelText("Close"));

    const notes = screen.getByLabelText("notes");
    notes.focus();
    rerender(ui(() => {})); // inline onClose: new identity every render
    await frame();
    expect(document.activeElement).toBe(notes);
  });

  it("Escape calls the latest onClose", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Sheet open onClose={first} title="T"><div /></Sheet>);
    rerender(<Sheet open onClose={second} title="T"><div /></Sheet>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("LogModal save", () => {
  const session = weeklyPlan.flatMap((d) => d.sessions)[0];

  it("keeps the existing completedAt when editing a saved log", () => {
    const onSave = vi.fn();
    render(
      <LogModal session={session} logKey="k" level="beginner" onClose={() => {}} onSave={onSave}
        logs={{ k: { notes: "x", duration: 30, feeling: 3, completedAt: "2026-01-02T03:04:05.000Z" } }} />,
    );
    fireEvent.click(screen.getByText("Save workout"));
    expect(onSave.mock.calls[0][1].completedAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("stamps completedAt on a first save", () => {
    const onSave = vi.fn();
    render(<LogModal session={session} logKey="k" level="beginner" onClose={() => {}} onSave={onSave} logs={{}} />);
    fireEvent.click(screen.getByText("Save workout"));
    expect(typeof onSave.mock.calls[0][1].completedAt).toBe("string");
  });

  it("clamps negative duration to zero", () => {
    const onSave = vi.fn();
    render(<LogModal session={session} logKey="k" level="beginner" onClose={() => {}} onSave={onSave} logs={{}} />);
    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "-5" } });
    fireEvent.click(screen.getByText("Save workout"));
    expect(onSave.mock.calls[0][1].duration).toBe(0);
  });

  it("drops negative weight/reps/sets instead of saving them", () => {
    const onSave = vi.fn();
    const withEx = weeklyPlan.flatMap((d) => d.sessions).find((s) => (s.levels.beginner?.exercises || []).length > 0)!;
    render(<LogModal session={withEx} logKey="k" level="beginner" onClose={() => {}} onSave={onSave} logs={{}} />);
    fireEvent.click(screen.getByText("Exercise details"));
    const w = document.querySelector('input[id^="ex-weight-"]') as HTMLInputElement;
    const r = document.querySelector('input[id^="ex-reps-"]') as HTMLInputElement;
    fireEvent.change(w, { target: { value: "-20" } });
    fireEvent.change(r, { target: { value: "8" } });
    fireEvent.click(screen.getByText("Save workout"));
    const logs = Object.values(onSave.mock.calls[0][1].exerciseLogs as Record<string, { weight?: number; reps?: number }>);
    expect(logs[0].weight).toBeUndefined();
    expect(logs[0].reps).toBe(8);
  });
});
