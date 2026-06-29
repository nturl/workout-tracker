import { describe, it, expect, beforeEach } from "vitest";
import { migrateHabitsState, seedDefaultHabits, useWorkoutStore } from "@/hooks/useWorkoutStore";
import { DEFAULT_HABITS, makeHabitId } from "@/lib/habits";

describe("DEFAULT_HABITS config", () => {
  it("has unique ids and includes the new + legacy habits", () => {
    const ids = DEFAULT_HABITS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["meditation", "walk", "duolingo", "readwise", "supplementsAm", "supplementsPm", "telegram", "email", "journal", "notWatch", "noGamble", "noNicotine", "ash"]) {
      expect(ids).toContain(id);
    }
  });

  it("every default id satisfies the sync validator id rule", () => {
    for (const { id, label } of DEFAULT_HABITS) {
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(id.length).toBeLessThanOrEqual(64);
      expect(label.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("makeHabitId", () => {
  it("slugifies a label to a kebab-case id", () => {
    expect(makeHabitId("Morning Run", [])).toBe("morning-run");
    expect(makeHabitId("Cold Shower!!!", [])).toBe("cold-shower");
    expect(makeHabitId("  Read 30m  ", [])).toBe("read-30m");
  });

  it("ensures uniqueness against existing ids with a numeric suffix", () => {
    expect(makeHabitId("Run", ["run"])).toBe("run-2");
    expect(makeHabitId("Run", ["run", "run-2"])).toBe("run-3");
  });

  it("always produces a validator-safe id, even for punctuation-only labels", () => {
    const id = makeHabitId("!!!", []);
    expect(id).toBe("habit");
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("caps the id at 64 chars", () => {
    const id = makeHabitId("a".repeat(200), []);
    expect(id.length).toBeLessThanOrEqual(64);
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
});

describe("migrateHabitsState (v1 -> v2)", () => {
  it("seeds habitDefs from DEFAULT_HABITS for an existing v1 user", () => {
    const out = migrateHabitsState({ habits: { walk: { "2026-05-01": true } } }, 1) as Record<string, unknown>;
    // Existing completion data is untouched...
    expect(out.habits).toEqual({ walk: { "2026-05-01": true } });
    // ...and the habit list is seeded with the defaults.
    expect(out.habitDefs).toEqual(DEFAULT_HABITS);
  });

  it("does not overwrite a habitDefs list the user already customized", () => {
    const custom = [{ id: "run", label: "Run" }];
    const out = migrateHabitsState({ habitDefs: custom }, 1) as Record<string, unknown>;
    expect(out.habitDefs).toEqual(custom);
  });

  it("seeds habitDefs when migrating all the way from v0", () => {
    const out = migrateHabitsState({ notWatch: { "2026-05-01": true } }, 0) as Record<string, unknown>;
    expect(out.habits).toEqual({ notWatch: { "2026-05-01": true } });
    expect(out.habitDefs).toEqual(DEFAULT_HABITS);
  });

  it("is a no-op at the current version", () => {
    const custom = [{ id: "run", label: "Run" }];
    const out = migrateHabitsState({ habitDefs: custom, habits: {} }, 3) as Record<string, unknown>;
    expect(out.habitDefs).toEqual(custom);
  });
});

describe("migrateHabitsState (v2 -> v3)", () => {
  it("drops the client-clock timestamp and seeds the server-version fields", () => {
    const out = migrateHabitsState(
      { habitDefs: [{ id: "run", label: "Run" }], habitDefsUpdatedAt: 9_999_999_999_999 },
      2,
    ) as Record<string, unknown>;
    // The (possibly skewed) wall-clock timestamp is gone...
    expect(out.habitDefsUpdatedAt).toBeUndefined();
    // ...replaced by a server-assigned version (reset to 0) and a not-dirty flag.
    expect(out.habitDefsVersion).toBe(0);
    expect(out.habitDefsDirty).toBe(false);
    expect(out.habitDefs).toEqual([{ id: "run", label: "Run" }]);
  });
});

describe("seedDefaultHabits", () => {
  it("returns an independent copy each call (no shared mutation)", () => {
    const a = seedDefaultHabits();
    const b = seedDefaultHabits();
    expect(a).toEqual(DEFAULT_HABITS);
    expect(a).not.toBe(b);
    a[0].label = "Mutated";
    expect(DEFAULT_HABITS[0].label).not.toBe("Mutated");
    expect(b[0].label).not.toBe("Mutated");
  });
});

describe("useWorkoutStore habits", () => {
  beforeEach(() => {
    useWorkoutStore.setState({ habits: {}, habitDefs: seedDefaultHabits(), habitDefsVersion: 0, habitDefsDirty: false });
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

describe("useWorkoutStore habitDefs management", () => {
  beforeEach(() => {
    useWorkoutStore.setState({ habits: {}, habitDefs: seedDefaultHabits(), habitDefsVersion: 0, habitDefsDirty: false });
  });

  it("addHabit appends a new def with a generated id and marks the list dirty", () => {
    const before = useWorkoutStore.getState().habitDefs.length;
    useWorkoutStore.getState().addHabit("Morning Run");
    const defs = useWorkoutStore.getState().habitDefs;
    expect(defs.length).toBe(before + 1);
    expect(defs[defs.length - 1]).toEqual({ id: "morning-run", label: "Morning Run" });
    // The version is server-assigned, so a local edit only flags dirty; it does
    // not invent a version.
    expect(useWorkoutStore.getState().habitDefsDirty).toBe(true);
    expect(useWorkoutStore.getState().habitDefsVersion).toBe(0);
  });

  it("addHabit generates a unique id on label collision", () => {
    useWorkoutStore.setState({ habitDefs: [{ id: "run", label: "Run" }], habitDefsVersion: 0, habitDefsDirty: false });
    useWorkoutStore.getState().addHabit("Run");
    const ids = useWorkoutStore.getState().habitDefs.map((h) => h.id);
    expect(ids).toEqual(["run", "run-2"]);
  });

  it("addHabit ignores a blank label", () => {
    const before = useWorkoutStore.getState().habitDefs.length;
    useWorkoutStore.getState().addHabit("   ");
    expect(useWorkoutStore.getState().habitDefs.length).toBe(before);
  });

  it("addHabit avoids reusing an orphaned completion-map id (no stale streak resurrection)", () => {
    // 'walk' was deleted earlier; its completion history is still orphaned.
    useWorkoutStore.setState({
      habitDefs: [{ id: "meditation", label: "Meditation" }],
      habits: { walk: { "2026-05-01": true } },
      habitDefsVersion: 0,
      habitDefsDirty: false,
    });
    useWorkoutStore.getState().addHabit("Walk"); // slugs to 'walk', which is taken
    const added = useWorkoutStore.getState().habitDefs.at(-1);
    expect(added?.id).toBe("walk-2");
    expect(added?.id).not.toBe("walk");
  });

  it("renameHabit updates only the matching def", () => {
    useWorkoutStore.getState().renameHabit("walk", "Long walk");
    const defs = useWorkoutStore.getState().habitDefs;
    expect(defs.find((h) => h.id === "walk")?.label).toBe("Long walk");
    // id is stable so completion streaks keep working.
    expect(defs.find((h) => h.id === "walk")?.id).toBe("walk");
  });

  it("removeHabit drops the def but leaves completion data orphaned (intact)", () => {
    useWorkoutStore.getState().toggleHabit("walk", "2026-05-29");
    useWorkoutStore.getState().removeHabit("walk");
    expect(useWorkoutStore.getState().habitDefs.find((h) => h.id === "walk")).toBeUndefined();
    // Orphaned completion data is deliberately not cleaned up.
    expect(useWorkoutStore.getState().habits.walk["2026-05-29"]).toBe(true);
  });

  it("removeHabit refuses to delete the last remaining habit", () => {
    useWorkoutStore.setState({ habitDefs: [{ id: "walk", label: "Outside walk" }], habitDefsVersion: 0, habitDefsDirty: false });
    useWorkoutStore.getState().removeHabit("walk");
    expect(useWorkoutStore.getState().habitDefs).toEqual([{ id: "walk", label: "Outside walk" }]);
  });

  it("moveHabit swaps adjacent entries and clamps at the edges", () => {
    useWorkoutStore.setState({
      habitDefs: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
      habitDefsVersion: 0,
      habitDefsDirty: false,
    });
    useWorkoutStore.getState().moveHabit("b", "up");
    expect(useWorkoutStore.getState().habitDefs.map((h) => h.id)).toEqual(["b", "a", "c"]);
    useWorkoutStore.getState().moveHabit("b", "up"); // already first -> no-op
    expect(useWorkoutStore.getState().habitDefs.map((h) => h.id)).toEqual(["b", "a", "c"]);
    useWorkoutStore.getState().moveHabit("c", "down"); // already last -> no-op
    expect(useWorkoutStore.getState().habitDefs.map((h) => h.id)).toEqual(["b", "a", "c"]);
  });
});

describe("hydrateFromSync habitDefs merge", () => {
  beforeEach(() => {
    useWorkoutStore.setState({ habits: {}, habitDefs: seedDefaultHabits(), habitDefsVersion: 0, habitDefsDirty: false });
  });

  it("server wins on initial hydration (local is the untouched default seed at version 0)", () => {
    const serverDefs = [{ id: "run", label: "Run" }, { id: "swim", label: "Swim" }];
    useWorkoutStore.getState().hydrateFromSync({ habitDefs: serverDefs, habitDefsVersion: 1 });
    expect(useWorkoutStore.getState().habitDefs).toEqual(serverDefs);
    expect(useWorkoutStore.getState().habitDefsVersion).toBe(1);
  });

  it("keeps the local list when the server version is older (stale device can't overwrite)", () => {
    const localDefs = [{ id: "run", label: "Run" }];
    useWorkoutStore.setState({ habitDefs: localDefs, habitDefsVersion: 5, habitDefsDirty: false });
    useWorkoutStore.getState().hydrateFromSync({
      habitDefs: [{ id: "swim", label: "Swim" }],
      habitDefsVersion: 1, // older than local
    });
    expect(useWorkoutStore.getState().habitDefs).toEqual(localDefs);
    expect(useWorkoutStore.getState().habitDefsVersion).toBe(5);
  });

  it("does not let an equal-version server echo clobber a pending local edit", () => {
    // Local edited (dirty) at the same base version the server still reports.
    const localDefs = [{ id: "run", label: "Run-renamed" }];
    useWorkoutStore.setState({ habitDefs: localDefs, habitDefsVersion: 3, habitDefsDirty: true });
    useWorkoutStore.getState().hydrateFromSync({
      habitDefs: [{ id: "run", label: "Run" }], // server's stale pre-edit copy
      habitDefsVersion: 3,
    });
    expect(useWorkoutStore.getState().habitDefs).toEqual(localDefs);
    expect(useWorkoutStore.getState().habitDefsDirty).toBe(true);
  });

  it("takes server defs when the server version is newer", () => {
    useWorkoutStore.setState({ habitDefs: [{ id: "run", label: "Run" }], habitDefsVersion: 1, habitDefsDirty: false });
    const serverDefs = [{ id: "run", label: "Run" }, { id: "swim", label: "Swim" }];
    useWorkoutStore.getState().hydrateFromSync({ habitDefs: serverDefs, habitDefsVersion: 2 });
    expect(useWorkoutStore.getState().habitDefs).toEqual(serverDefs);
    expect(useWorkoutStore.getState().habitDefsVersion).toBe(2);
  });

  it("leaves local defs untouched when the server has none", () => {
    const localDefs = [{ id: "run", label: "Run" }];
    useWorkoutStore.setState({ habitDefs: localDefs, habitDefsVersion: 5, habitDefsDirty: false });
    useWorkoutStore.getState().hydrateFromSync({ completions: { x: true } });
    expect(useWorkoutStore.getState().habitDefs).toEqual(localDefs);
  });

  it("falls back to DEFAULT_HABITS if both local and server lists are empty", () => {
    useWorkoutStore.setState({ habitDefs: [], habitDefsVersion: 0, habitDefsDirty: false });
    useWorkoutStore.getState().hydrateFromSync({});
    expect(useWorkoutStore.getState().habitDefs).toEqual(DEFAULT_HABITS);
  });

  it("breaks an exact-version tie deterministically so both devices converge", () => {
    // Device 1: local ['b'] @ v100 receives server ['a'] @ v100 -> keeps ['b'].
    useWorkoutStore.setState({ habitDefs: [{ id: "b", label: "B" }], habitDefsVersion: 100, habitDefsDirty: false });
    useWorkoutStore.getState().hydrateFromSync({ habitDefs: [{ id: "a", label: "A" }], habitDefsVersion: 100 });
    expect(useWorkoutStore.getState().habitDefs.map((h) => h.id)).toEqual(["b"]);

    // Device 2: local ['a'] @ v100 receives server ['b'] @ v100 -> adopts ['b'].
    useWorkoutStore.setState({ habitDefs: [{ id: "a", label: "A" }], habitDefsVersion: 100, habitDefsDirty: false });
    useWorkoutStore.getState().hydrateFromSync({ habitDefs: [{ id: "b", label: "B" }], habitDefsVersion: 100 });
    expect(useWorkoutStore.getState().habitDefs.map((h) => h.id)).toEqual(["b"]);
    // Both devices end on ['b'] — convergence.
  });
});
