import { describe, it, expect, beforeEach } from "vitest";
import { migrateHabitsState, useWorkoutStore } from "@/hooks/useWorkoutStore";
import { HABITS } from "@/lib/habits";

describe("HABITS config", () => {
  it("has unique ids and includes the new + legacy habits", () => {
    const ids = HABITS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["meditation", "walk", "duolingo", "readwise", "supplementsAm", "supplementsPm", "telegram", "email", "journal", "notWatch", "noGamble", "noNicotine", "ash"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("migrateHabitsState (v0 -> v1)", () => {
  it("folds legacy top-level habit fields into a habits map and drops the old keys", () => {
    const out = migrateHabitsState(
      {
        completions: { a: true },
        notWatch: { "2026-05-01": true },
        ash: { "2026-05-02": true },
        meditation: {},
      },
      0,
    ) as Record<string, unknown>;

    expect(out.habits).toEqual({
      notWatch: { "2026-05-01": true },
      ash: { "2026-05-02": true },
    });
    // Empty legacy maps are not carried over, and old keys are removed.
    expect(out.notWatch).toBeUndefined();
    expect(out.ash).toBeUndefined();
    expect(out.meditation).toBeUndefined();
    expect(out.completions).toEqual({ a: true });
  });

  it("is a no-op once already at v1", () => {
    const state = { habits: { walk: { "2026-05-01": true } } };
    const out = migrateHabitsState(state, 1) as Record<string, unknown>;
    expect(out.habits).toEqual({ walk: { "2026-05-01": true } });
  });
});

describe("useWorkoutStore habits", () => {
  beforeEach(() => {
    useWorkoutStore.setState({ habits: {} });
  });

  it("toggleHabit flips a single habit/date without touching others", () => {
    useWorkoutStore.getState().toggleHabit("walk", "2026-05-29");
    expect(useWorkoutStore.getState().habits.walk["2026-05-29"]).toBe(true);
    useWorkoutStore.getState().toggleHabit("duolingo", "2026-05-29");
    expect(useWorkoutStore.getState().habits.walk["2026-05-29"]).toBe(true);
    expect(useWorkoutStore.getState().habits.duolingo["2026-05-29"]).toBe(true);
    // Toggling again clears it.
    useWorkoutStore.getState().toggleHabit("walk", "2026-05-29");
    expect(useWorkoutStore.getState().habits.walk["2026-05-29"]).toBe(false);
  });

  it("hydrateFromSync merges an incoming habits map (prefer-true)", () => {
    useWorkoutStore.getState().toggleHabit("walk", "2026-05-29"); // local true
    useWorkoutStore.getState().hydrateFromSync({ habits: { duolingo: { "2026-05-29": true } } });
    expect(useWorkoutStore.getState().habits.walk["2026-05-29"]).toBe(true);
    expect(useWorkoutStore.getState().habits.duolingo["2026-05-29"]).toBe(true);
  });

  it("folds legacy synced fields into the map without resurrecting a local uncheck", () => {
    // User unchecked notWatch for a date locally (present, false).
    useWorkoutStore.setState({ habits: { notWatch: { "2026-05-01": false } } });
    useWorkoutStore.getState().hydrateFromSync({
      notWatch: { "2026-05-01": true, "2026-04-30": true }, // stale server legacy
    });
    const notWatch = useWorkoutStore.getState().habits.notWatch;
    // The locally-unchecked date is preserved (not overridden by stale legacy)...
    expect(notWatch["2026-05-01"]).toBe(false);
    // ...but a date only present in legacy is filled in.
    expect(notWatch["2026-04-30"]).toBe(true);
  });
});
