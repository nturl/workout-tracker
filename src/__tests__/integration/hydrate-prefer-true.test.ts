import { describe, it, expect } from "vitest";
import { useWorkoutStore, emptyDirty } from "@/hooks/useWorkoutStore";
import { beforeEach } from "vitest";

// Hydrate merge rule: dirty (unacked) local keys win, everything else takes
// the server's value, including a server-side false or deletion (audit F5/F8).
// This replaced V19's prefer-true merge, whose race (a fresh tap overwritten
// by stale server state) is now covered by dirty tracking.

// ---------------------------------------------------------------------------
// BUG-01/BUG-04: on top of the prefer-true net above, a hydrate must never
// overwrite a key THIS device changed and has not yet had acked. That is what
// makes an explicit habit "missed" (false) survive a stale server "done", which
// prefer-true structurally cannot do.
// ---------------------------------------------------------------------------
describe("hydrateFromSync: a pending local change wins over the server copy", () => {
  beforeEach(() => {
    useWorkoutStore.setState({
      completions: {},
      logs: {},
      habits: {},
      level: "beginner",
      dirty: emptyDirty(),
    });
  });

  it("keeps an explicit local 'missed' against a stale server 'done'", () => {
    useWorkoutStore.getState().setHabit("meditation", "2026-09-01", false);
    useWorkoutStore.getState().hydrateFromSync({ habits: { meditation: { "2026-09-01": true } } });
    expect(useWorkoutStore.getState().habits.meditation["2026-09-01"]).toBe(false);
  });

  it("takes the server's value for a date this device did not change", () => {
    useWorkoutStore.getState().hydrateFromSync({ habits: { meditation: { "2026-08-30": true } } });
    expect(useWorkoutStore.getState().habits.meditation["2026-08-30"]).toBe(true);
  });

  it("does not let the server resurrect a date this device cleared", () => {
    useWorkoutStore.getState().setHabit("meditation", "2026-09-01", true);
    useWorkoutStore.getState().clearHabit("meditation", "2026-09-01");
    useWorkoutStore.getState().hydrateFromSync({ habits: { meditation: { "2026-09-01": true } } });
    expect("2026-09-01" in useWorkoutStore.getState().habits.meditation).toBe(false);
  });

  it("applies a server un-toggle to a completion this device did not change", () => {
    useWorkoutStore.setState({ completions: { k: true } });
    useWorkoutStore.getState().hydrateFromSync({ completions: { k: false } });
    expect(useWorkoutStore.getState().completions.k).toBe(false);
  });

  it("keeps a fresh local completion against a stale server false (the V19 race)", () => {
    useWorkoutStore.getState().toggleCompletion("wk-set-1");
    useWorkoutStore.getState().hydrateFromSync({ completions: { "wk-set-1": false } });
    expect(useWorkoutStore.getState().completions["wk-set-1"]).toBe(true);
  });

  it("drops a habit date the server deleted, but not one pending locally", () => {
    useWorkoutStore.setState({ habits: { meditation: { "2026-10-12": true } } });
    useWorkoutStore.getState().setHabit("meditation", "2026-10-13", true);
    useWorkoutStore.getState().hydrateFromSync({ habits: { meditation: {} } });
    const rec = useWorkoutStore.getState().habits.meditation;
    expect(rec["2026-10-12"]).toBeUndefined();
    expect(rec["2026-10-13"]).toBe(true);
  });

  it("keeps a dirty local recovery date against the server's entry", () => {
    useWorkoutStore.setState({
      recoveryData: { "2026-10-14": { date: "2026-10-14", eightSleep: { sleepFitnessScore: 91 } } },
      dirty: { ...emptyDirty(), recovery: { "2026-10-14": true } },
    });
    useWorkoutStore.getState().hydrateFromSync({
      recovery: { "2026-10-14": { date: "2026-10-14", eightSleep: { sleepFitnessScore: 70 } } },
    });
    expect(useWorkoutStore.getState().recoveryData["2026-10-14"].eightSleep?.sleepFitnessScore).toBe(91);
  });

  it("keeps a pending local level and takes the server's once it is acked", () => {
    useWorkoutStore.getState().setLevel("advanced");
    useWorkoutStore.getState().hydrateFromSync({ level: "beginner" });
    expect(useWorkoutStore.getState().level).toBe("advanced");

    const sent = useWorkoutStore.getState().getSyncDelta();
    useWorkoutStore.getState().clearDirty(sent);
    useWorkoutStore.getState().hydrateFromSync({ level: "intermediate" });
    expect(useWorkoutStore.getState().level).toBe("intermediate");
  });
});

// ---------------------------------------------------------------------------
// getSyncDelta / clearDirty: what actually leaves the device.
// ---------------------------------------------------------------------------
describe("getSyncDelta", () => {
  beforeEach(() => {
    useWorkoutStore.setState({
      completions: {},
      logs: {},
      habits: {},
      level: "beginner",
      recoveryData: {},
      dirty: emptyDirty(),
    });
  });

  it("carries only changed keys, and marks it as a delta", () => {
    useWorkoutStore.setState({ completions: { "old-set": true } });
    useWorkoutStore.getState().toggleCompletion("new-set");
    const delta = useWorkoutStore.getState().getSyncDelta();
    expect(delta.syncMode).toBe("delta");
    expect(delta.completions).toEqual({ "new-set": true });
    expect(delta.level).toBeUndefined();
    expect(delta.tombstones).toBeUndefined();
  });

  it("turns a locally-removed habit date into a tombstone", () => {
    useWorkoutStore.getState().setHabit("meditation", "2026-09-01", true);
    useWorkoutStore.getState().clearHabit("meditation", "2026-09-01");
    const delta = useWorkoutStore.getState().getSyncDelta();
    expect(delta.habits).toBeUndefined();
    expect(delta.tombstones?.habits).toEqual({ meditation: ["2026-09-01"] });
  });

  it("clearDirty retires only what the push settled, and keeps a mid-flight edit", () => {
    useWorkoutStore.getState().toggleCompletion("set-a");
    const sent = useWorkoutStore.getState().getSyncDelta();

    // The user taps again while the request is in flight.
    useWorkoutStore.getState().toggleCompletion("set-a");
    useWorkoutStore.getState().toggleCompletion("set-b");
    useWorkoutStore.getState().clearDirty(sent);

    const next = useWorkoutStore.getState().getSyncDelta();
    expect(next.completions).toEqual({ "set-a": false, "set-b": true });
  });

  it("clearDirty retires a key whose value still matches what was sent", () => {
    useWorkoutStore.getState().toggleCompletion("set-a");
    const sent = useWorkoutStore.getState().getSyncDelta();
    useWorkoutStore.getState().clearDirty(sent);
    const next = useWorkoutStore.getState().getSyncDelta();
    expect(next.completions).toBeUndefined();
    expect(next.tombstones).toBeUndefined();
  });
});
