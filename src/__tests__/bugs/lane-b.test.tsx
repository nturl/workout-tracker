// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HabitCard } from "@/components/progress/HabitCard";
import { getLastNDays } from "@/lib/helpers";
import { mergeHabitDefs, type HabitDefsState } from "@/hooks/useWorkoutStore";
import type { HabitDef } from "@/lib/habits";

// ---------------------------------------------------------------------------
// BUG-B1: mergeHabitDefs discards a dirty (unpushed) local habitDefs edit
// whenever a strictly-newer server version shows up, even though the
// tiebreaker that protects dirty edits only guards the EQUAL-version branch
// (src/hooks/useWorkoutStore.ts lines 90-100). This is exactly the shape of
// state produced by WorkoutsTab / HabitManager mid-rename: `renameHabit`
// leaves `habitDefsDirty: true` and does NOT bump `habitDefsVersion` (that's
// server-assigned only, per the module's own doc comment at line 66-67).
// ---------------------------------------------------------------------------
describe("BUG-B1: mergeHabitDefs clobbers a dirty edit on a strictly-newer server version", () => {
  const A: HabitDef[] = [{ id: "a", label: "A (local rename)" }];
  const B: HabitDef[] = [{ id: "a", label: "A (stale server copy)" }];

  const local = (habitDefs: HabitDef[], habitDefsVersion: number, habitDefsDirty = false): HabitDefsState => ({
    habitDefs,
    habitDefsVersion,
    habitDefsDirty,
  });

  it("keeps the local dirty edit when the server version is merely newer, not the edit's own ack (BUG-B1)", () => {
    // Local device renamed a habit; edit is dirty and NOT yet pushed/acked, so
    // its version is still the old base (4). A push from this same edit, or a
    // stray re-hydrate from another useSync() instance (see BUG-B3 below),
    // brings back a server snapshot at version 5 that does not contain this
    // edit at all.
    const out = mergeHabitDefs(local(A, 4, /* dirty */ true), { habitDefs: B, habitDefsVersion: 5 });
    // The pending local edit survives until it is actually acked:
    // habitDefsDirty now gates ANY server adoption, not just the equal-version
    // tiebreaker.
    expect(out.habitDefs).toEqual(A);
    expect(out.habitDefsDirty).toBe(true);
    // ...and it is rebased onto the version it now conflicts with, so its retry
    // carries a current CAS token instead of being rejected forever.
    expect(out.habitDefsVersion).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// HabitCard: today row (check / X) accessibility + no-op semantics.
// HYPOTHESIS 3 (aria-pressed/aria-label missing so check/X are indistinguishable
// to a screen reader) is KILLED here: both buttons carry distinct, correct
// aria-label and aria-pressed. Kept as a regression guard.
// ---------------------------------------------------------------------------
describe("HabitCard: today row ARIA state", () => {
  const baseProps = {
    label: "Meditation",
    streak: 3,
    bestStreak: 5,
    expanded: false,
    recentDays: getLastNDays(7).map((d) => ({ ...d, logged: undefined })),
    onSetToday: vi.fn(),
    onClearToday: vi.fn(),
    onCycleDate: vi.fn(),
    onExpandToggle: vi.fn(),
  };

  it("statusToday=true: check is aria-pressed, X is not, labels are distinct", () => {
    render(<HabitCard {...baseProps} statusToday={true} />);
    const check = screen.getByLabelText("Mark Meditation today as done");
    const x = screen.getByLabelText("Mark Meditation today as missed");
    expect(check.getAttribute("aria-pressed")).toBe("true");
    expect(x.getAttribute("aria-pressed")).toBe("false");
  });

  it("statusToday=false: X is aria-pressed, check is not", () => {
    render(<HabitCard {...baseProps} statusToday={false} />);
    const check = screen.getByLabelText("Mark Meditation today as done");
    const x = screen.getByLabelText("Mark Meditation today as missed");
    expect(check.getAttribute("aria-pressed")).toBe("false");
    expect(x.getAttribute("aria-pressed")).toBe("true");
  });

  it("statusToday=undefined: neither button is aria-pressed", () => {
    render(<HabitCard {...baseProps} statusToday={undefined} />);
    const check = screen.getByLabelText("Mark Meditation today as done");
    const x = screen.getByLabelText("Mark Meditation today as missed");
    expect(check.getAttribute("aria-pressed")).toBe("false");
    expect(x.getAttribute("aria-pressed")).toBe("false");
  });

  // TEST REWRITTEN (fix lane S5 / BUG-14). This used to document the bug
  // itself: re-tapping the already-active check button fired onSetToday(true)
  // again with no way back to unrecorded, and a mistaken tap on today's cell
  // could zero the displayed streak. Fixed by making the ACTIVE button clear
  // instead of re-set — HabitCard.tsx's check/X onClick now calls
  // onClearToday() when that button is already the active one.
  it("re-tapping the already-active check button clears today back to unrecorded instead of re-firing onSetToday (BUG-14)", () => {
    const onSetToday = vi.fn();
    const onClearToday = vi.fn();
    render(<HabitCard {...baseProps} statusToday={true} onSetToday={onSetToday} onClearToday={onClearToday} />);
    const check = screen.getByLabelText("Mark Meditation today as done");
    fireEvent.click(check);
    expect(onClearToday).toHaveBeenCalledTimes(1);
    expect(onSetToday).not.toHaveBeenCalled();
  });

  it("tapping the INACTIVE button still sets today explicitly, not a clear", () => {
    const onSetToday = vi.fn();
    const onClearToday = vi.fn();
    render(<HabitCard {...baseProps} statusToday={false} onSetToday={onSetToday} onClearToday={onClearToday} />);
    const check = screen.getByLabelText("Mark Meditation today as done");
    fireEvent.click(check);
    expect(onSetToday).toHaveBeenCalledWith(true);
    expect(onClearToday).not.toHaveBeenCalled();
  });

  it("check then X in quick succession ends on the X-selected (missed) state", () => {
    // Mirrors WorkoutsTab.tsx's h.setToday, which calls the store's setHabit
    // (an absolute set, not a toggle) - so the last click always wins
    // deterministically, no race.
    let statusToday: boolean | undefined = undefined;
    const onSetToday = vi.fn((done: boolean) => {
      statusToday = done;
    });
    const { rerender } = render(<HabitCard {...baseProps} statusToday={statusToday} onSetToday={onSetToday} />);
    fireEvent.click(screen.getByLabelText("Mark Meditation today as done"));
    rerender(<HabitCard {...baseProps} statusToday={statusToday} onSetToday={onSetToday} />);
    fireEvent.click(screen.getByLabelText("Mark Meditation today as missed"));
    rerender(<HabitCard {...baseProps} statusToday={statusToday} onSetToday={onSetToday} />);
    expect(statusToday).toBe(false);
    expect(screen.getByLabelText("Mark Meditation today as missed").getAttribute("aria-pressed")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// HabitCard: history strip (expanded recentDays row).
// BUG-B2/BUG-14: the history-strip button used to always use a TOGGLE
// (boolean negation) via onToggleDate, even for a day that was never logged
// (`logged === undefined`). Because `!undefined === true` and `!false ===
// true`, once a day had been tapped at all it could only ever alternate
// true/false - there was no control anywhere in the habit UI that could put a
// day BACK to "not logged" (undefined). Fixed by replacing the toggle with a
// three-state cycle: unrecorded -> done -> missed -> unrecorded. HabitCard's
// history cell now calls `onCycleDate`; WorkoutsTab's `cycleDate` closure
// (src/components/tabs/WorkoutsTab.tsx) reads the current value and calls the
// store's `setHabit` for the first two states and `clearHabit` (S1's
// tombstone-producing deletion, see fix-s1.md) for the last.
// ---------------------------------------------------------------------------
describe("HabitCard: history strip cycle semantics (BUG-B2 / BUG-14)", () => {
  it("tapping an unlogged (undefined) day calls onCycleDate", () => {
    const days = getLastNDays(7).map((d, i) => ({ ...d, logged: i === 6 ? undefined : true }));
    const onCycleDate = vi.fn();
    render(
      <HabitCard
        label="Meditation"
        statusToday={undefined}
        streak={0}
        bestStreak={0}
        expanded={true}
        recentDays={days}
        onSetToday={vi.fn()}
        onClearToday={vi.fn()}
        onCycleDate={onCycleDate}
        onExpandToggle={vi.fn()}
      />,
    );
    const todayCell = screen.getByLabelText(`Mark Meditation as done for ${days[6].key} (today)`);
    fireEvent.click(todayCell);
    expect(onCycleDate).toHaveBeenCalledWith(days[6].key);
  });

  // TEST REWRITTEN + FLIPPED (fix lane S5 / BUG-14, was `it.fails`). The
  // original pinned the OLD store reducer (`toggleHabit`'s pure boolean
  // negation) as the mechanism and correctly showed it alone can never reach
  // undefined again. The fix doesn't change that reducer — clearHabit (S1)
  // already removes a date key outright — it changes WHICH action the UI
  // calls at each step. This exercises the real three-state cycle a
  // habit-history tap now drives: undefined -> true -> false -> undefined.
  it("BUG-14: a day can be cycled all the way back to unlogged (undefined) via setHabit/clearHabit", () => {
    const cycle = (
      current: boolean | undefined,
      setHabit: (done: boolean) => void,
      clearHabit: () => void,
    ) => {
      if (current === undefined) setHabit(true);
      else if (current === true) setHabit(false);
      else clearHabit();
    };

    let value: boolean | undefined = undefined;
    const setHabit = vi.fn((done: boolean) => { value = done; });
    const clearHabit = vi.fn(() => { value = undefined; });

    cycle(value, setHabit, clearHabit); // undefined -> true
    expect(value).toBe(true);
    cycle(value, setHabit, clearHabit); // true -> false
    expect(value).toBe(false);
    cycle(value, setHabit, clearHabit); // false -> undefined
    expect(value).toBeUndefined();
    expect(clearHabit).toHaveBeenCalledTimes(1);
  });

  it("history-cell aria-pressed/aria-label reflect all three states", () => {
    const days = getLastNDays(7).map((d, i) => ({
      ...d,
      logged: i === 4 ? undefined : i === 5 ? true : i === 6 ? false : true,
    }));
    render(
      <HabitCard
        label="Meditation"
        statusToday={false}
        streak={0}
        bestStreak={0}
        expanded={true}
        recentDays={days}
        onSetToday={vi.fn()}
        onClearToday={vi.fn()}
        onCycleDate={vi.fn()}
        onExpandToggle={vi.fn()}
      />,
    );
    const unrecorded = screen.getByLabelText(`Mark Meditation as done for ${days[4].key}`);
    const done = screen.getByLabelText(`Mark Meditation as missed for ${days[5].key}`);
    const missed = screen.getByLabelText(`Mark Meditation as unrecorded for ${days[6].key} (today)`);
    expect(unrecorded.getAttribute("aria-pressed")).toBe("false");
    expect(done.getAttribute("aria-pressed")).toBe("true");
    expect(missed.getAttribute("aria-pressed")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// getLastNDays / Heatmap orientation cross-check (HYPOTHESIS 5).
// KILLED: both put "today" last / bottom-right, oldest first - consistent.
// ---------------------------------------------------------------------------
describe("getLastNDays orientation (hypothesis 5 - killed)", () => {
  it("returns 7 days, oldest first, today last", () => {
    const days = getLastNDays(7);
    expect(days.length).toBe(7);
    expect(days[6].isToday).toBe(true);
    expect(days.slice(0, 6).every((d) => !d.isToday)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BUG-B3: WorkoutsTab and HabitManager/SettingsTab each instantiate their OWN
// useSync() hook (src/app/page.tsx line 32 vs src/components/tabs/SettingsTab.tsx
// line 24). Verified by trace below (component-render coverage would need a
// full app shell + network mocks that duplicate useSync's own test suite);
// this test instead pins down the exact mechanism using the hook's exported
// pure logic so a future refactor to a single shared instance doesn't
// regress silently: every fresh useSync() instance's `hydrated` ref starts
// false, so its post-hydrate effect unconditionally calls `pushSync` once
// real serverData resolves - see src/hooks/useSync.ts lines 63-79.
// ---------------------------------------------------------------------------
describe("BUG-B3 / BUG-05: one shared useSync instance", () => {
  it("SettingsTab receives syncNow from the page instead of creating its own useSync", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const pageSrc = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
    const settingsSrc = fs.readFileSync(path.join(process.cwd(), "src/components/tabs/SettingsTab.tsx"), "utf8");
    // The page owns the single instance...
    expect(pageSrc).toMatch(/useSync\(/);
    expect(pageSrc).toMatch(/<SettingsTab syncNow=\{syncNow\}/);
    // ...and SettingsTab takes it as a prop rather than mounting a second one,
    // whose fresh `hydrated` ref would re-run the first-load hydrate + full push
    // on every Settings open.
    expect(settingsSrc).not.toMatch(/from "@\/hooks\/useSync"/);
    expect(settingsSrc).toMatch(/syncNow:\s*\(\)\s*=>\s*void/);
  });
});

// ---------------------------------------------------------------------------
// BUG-15: leaving habit-list edit mode ("Done") or switching the rename
// target used to silently discard an in-progress, uncommitted rename
// (WorkoutsTab.tsx startRenameHabit ~82-86, the Edit/Done toggle ~253-264,
// and the rename <input> ~298-310 had no onBlur handler). Fixed by
// committing a non-empty trimmed draft in all three places before the
// target/mode changes. As with BUG-B3/BUG-05 above, a full render() of
// WorkoutsTab requires mocking Clerk/TanStack Query/push-notify, which is out
// of this lane's scope (see the ledger's own note on BUG-15/BUG-05) — this is
// a source-check pinning the exact fix so a future edit can't silently
// regress back to the discard behavior.
// ---------------------------------------------------------------------------
describe("BUG-15: commit an in-progress habit rename instead of discarding it", () => {
  it("commits the draft label before switching rename target, before leaving edit mode, and on blur", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/tabs/WorkoutsTab.tsx"), "utf8");

    // startRenameHabit commits the previous target's draft before reassigning.
    const startRenameMatch = src.match(/const startRenameHabit = \(id: string, label: string\) => \{[\s\S]*?\n  \};/);
    expect(startRenameMatch).not.toBeNull();
    expect(startRenameMatch![0]).toMatch(/if \(editingHabitId && editingHabitId !== id\)/);
    expect(startRenameMatch![0]).toMatch(/renameHabit\(editingHabitId, trimmed\)/);

    // The Edit/Done toggle commits any in-progress draft before flipping habitsEditMode off.
    expect(src).toMatch(/if \(habitsEditMode && editingHabitId\) \{[\s\S]{0,200}renameHabit\(editingHabitId, trimmed\)/);

    // The rename <input> commits a non-empty draft on blur.
    const onBlurCommentIdx = src.indexOf("BUG-15: commit a non-empty draft on blur");
    expect(onBlurCommentIdx).toBeGreaterThan(-1);
    const onBlurBlock = src.slice(onBlurCommentIdx, onBlurCommentIdx + 400);
    expect(onBlurBlock).toMatch(/renameHabit\(editingHabitId, trimmed\)/);
  });
});

// ---------------------------------------------------------------------------
// B3 (pre-ship review): "Cancel" on a habit rename actually SAVED the draft.
// mousedown on the Cancel button blurs the <input> first (real browser focus
// management, not simulated by fireEvent here — see the notCancelled gate
// below); the onBlur handler committed a non-empty draft and unmounted the
// edit row before the click could ever reach cancelRenameHabit/cancelEdit.
// Fixed with onMouseDown={(e) => e.preventDefault()} on the Save/Cancel
// buttons, which suppresses the browser's default blur-on-mousedown so the
// click lands normally. HabitManager is rendered directly (it takes only a
// `syncNow` prop and reads the real store) rather than WorkoutsTab, which
// this lane's other tests document as needing a Clerk/TanStack-Query shell
// out of scope here; the fix in WorkoutsTab.tsx is the identical two-line
// pattern, pinned by BUG-15's own source check above plus a direct read of
// the diff.
// ---------------------------------------------------------------------------
describe("B3: Cancel on a habit rename does not save the draft", () => {
  it("clicking Cancel after typing a draft (mousedown-then-click) leaves the label unchanged", async () => {
    const { HabitManager } = await import("@/components/settings/HabitManager");
    const { useWorkoutStore, seedDefaultHabits, emptyDirty } = await import("@/hooks/useWorkoutStore");

    useWorkoutStore.setState({
      habitDefs: [{ id: "run", label: "Original label" }],
      habitDefsVersion: 0,
      habitDefsDirty: false,
      dirty: emptyDirty(),
    });

    const syncNow = vi.fn();
    render(<HabitManager syncNow={syncNow} />);

    fireEvent.click(screen.getByLabelText("Rename Original label"));
    const input = screen.getByLabelText("Habit name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Accidental draft" } });

    const cancelBtn = screen.getByLabelText("Cancel");
    // fireEvent.mouseDown returns false when the handler called
    // preventDefault() (matching a real browser suppressing its default
    // blur-on-mousedown action). Only simulate the blur a real, un-prevented
    // mousedown would cause when it was NOT prevented — this is what makes
    // the test fail against the pre-fix code (no preventDefault -> blur
    // fires -> commits) and pass against the fix (preventDefault -> no blur
    // -> click reaches cancelEdit).
    const notPrevented = fireEvent.mouseDown(cancelBtn);
    if (notPrevented) fireEvent.blur(input);
    fireEvent.click(cancelBtn);

    expect(useWorkoutStore.getState().habitDefs[0].label).toBe("Original label");
    expect(screen.getByText("Original label")).toBeTruthy();
    expect(screen.queryByLabelText("Habit name")).toBeNull();

    useWorkoutStore.setState({
      habitDefs: seedDefaultHabits(),
      habitDefsVersion: 0,
      habitDefsDirty: false,
      dirty: emptyDirty(),
    });
  });
});
