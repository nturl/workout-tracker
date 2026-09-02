import { describe, it, expect } from "vitest";
import { mergeHabitDefs, type HabitDefsState } from "@/hooks/useWorkoutStore";
import type { HabitDef } from "@/lib/habits";

// The habit-def list merges on a SERVER-ASSIGNED version, never a client clock.
// These cover the merge half of the clock-skew fix: a device can only adopt a
// list whose version the server actually advanced, and a not-yet-pushed local
// edit is protected from an equal-version echo.

const A: HabitDef[] = [{ id: "a", label: "A" }];
const B: HabitDef[] = [{ id: "b", label: "B" }];

const local = (habitDefs: HabitDef[], habitDefsVersion: number, habitDefsDirty = false): HabitDefsState => ({
  habitDefs,
  habitDefsVersion,
  habitDefsDirty,
});

describe("mergeHabitDefs", () => {
  it("adopts the server list when the server version is strictly newer and nothing local is pending", () => {
    const out = mergeHabitDefs(local(A, 1), { habitDefs: B, habitDefsVersion: 2 });
    expect(out.habitDefs).toEqual(B);
    expect(out.habitDefsVersion).toBe(2);
    expect(out.habitDefsDirty).toBe(false);
  });

  it("keeps the local list when the incoming version is older (stale device can't overwrite)", () => {
    const out = mergeHabitDefs(local(A, 5), { habitDefs: B, habitDefsVersion: 3 });
    expect(out.habitDefs).toEqual(A);
    expect(out.habitDefsVersion).toBe(5);
  });

  it("protects a pending local edit from an equal-version server echo (does not clobber)", () => {
    // Local edited B (dirty) at the same base version the server still reports
    // with its old list A. The about-to-be-pushed edit must survive.
    const out = mergeHabitDefs(local(B, 4, /* dirty */ true), { habitDefs: A, habitDefsVersion: 4 });
    expect(out.habitDefs).toEqual(B);
    expect(out.habitDefsVersion).toBe(4);
    expect(out.habitDefsDirty).toBe(true);
  });

  it("uses the deterministic content tiebreaker on an equal-version tie when not dirty", () => {
    // JSON.stringify(B) > JSON.stringify(A) ("b" > "a"), so the server wins and
    // both devices converge on the same list.
    const out = mergeHabitDefs(local(A, 4, /* dirty */ false), { habitDefs: B, habitDefsVersion: 4 });
    expect(out.habitDefs).toEqual(B);
    expect(out.habitDefsVersion).toBe(4);
  });

  it("adopts the server list when the local list is empty", () => {
    const out = mergeHabitDefs(local([], 9), { habitDefs: B, habitDefsVersion: 0 });
    expect(out.habitDefs).toEqual(B);
    expect(out.habitDefsVersion).toBe(0);
  });

  it("is a no-op when the server sends no habitDefs", () => {
    const out = mergeHabitDefs(local(A, 2, true), {});
    expect(out.habitDefs).toEqual(A);
    expect(out.habitDefsVersion).toBe(2);
    expect(out.habitDefsDirty).toBe(true);
  });

  it("seeds defaults rather than leaving an empty list", () => {
    const out = mergeHabitDefs(local([], 0), { habitDefs: [], habitDefsVersion: 0 });
    expect(out.habitDefs.length).toBeGreaterThan(0);
    expect(out.habitDefsVersion).toBe(0);
  });

  // BUG-02: the dirty guard used to protect only the equal-version tiebreaker,
  // so any strictly-newer server version silently ate an unpushed edit AND
  // cleared habitDefsDirty, which stopped the edit being tracked for re-send.
  it("protects a pending local edit from a strictly-newer server version", () => {
    const out = mergeHabitDefs(local(A, 4, /* dirty */ true), { habitDefs: B, habitDefsVersion: 9 });
    expect(out.habitDefs).toEqual(A);
    expect(out.habitDefsDirty).toBe(true);
  });

  it("rebases a protected pending edit onto the newer server version so its retry is accepted", () => {
    // Without the rebase the retry keeps carrying base 4, resolveHabitDefs
    // keeps rejecting it as stale, and the edit can never land.
    const out = mergeHabitDefs(local(A, 4, /* dirty */ true), { habitDefs: B, habitDefsVersion: 9 });
    expect(out.habitDefsVersion).toBe(9);
  });

  it("does not rebase past an older server version", () => {
    const out = mergeHabitDefs(local(A, 7, /* dirty */ true), { habitDefs: B, habitDefsVersion: 3 });
    expect(out.habitDefs).toEqual(A);
    expect(out.habitDefsVersion).toBe(7);
    expect(out.habitDefsDirty).toBe(true);
  });
});
