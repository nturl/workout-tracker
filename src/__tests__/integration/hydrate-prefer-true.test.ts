import { describe, it, expect } from "vitest";
import { mergeCompletionsPreferTrue, useWorkoutStore, emptyDirty } from "@/hooks/useWorkoutStore";
import { beforeEach } from "vitest";

// V19 P0: prefer-true merge for completions on hydrate.
// Guards against the regression that ate a full workout today: fresh local
// completions were overwritten by stale server state on re-hydrate.

describe("mergeCompletionsPreferTrue", () => {
  it("keeps a fresh local true when server says false (the bug)", () => {
    const merged = mergeCompletionsPreferTrue(
      { "wk-set-1": true },
      { "wk-set-1": false },
    );
    expect(merged["wk-set-1"]).toBe(true);
  });

  it("accepts a server true when local has no entry yet", () => {
    const merged = mergeCompletionsPreferTrue({}, { "wk-set-2": true });
    expect(merged["wk-set-2"]).toBe(true);
  });

  it("accepts a server true when local explicitly has false", () => {
    // Another device completed the set, untoggling wasn't the intent.
    const merged = mergeCompletionsPreferTrue(
      { "wk-set-3": false },
      { "wk-set-3": true },
    );
    expect(merged["wk-set-3"]).toBe(true);
  });

  it("stays false when both sides are false", () => {
    const merged = mergeCompletionsPreferTrue(
      { "wk-set-4": false },
      { "wk-set-4": false },
    );
    expect(merged["wk-set-4"]).toBe(false);
  });

  it("preserves local-only keys that the server payload omits", () => {
    const merged = mergeCompletionsPreferTrue(
      { "wk-local-only": true, "wk-shared": true },
      { "wk-shared": false },
    );
    expect(merged["wk-local-only"]).toBe(true);
    expect(merged["wk-shared"]).toBe(true);
  });

  it("is a no-op when incoming is undefined", () => {
    const merged = mergeCompletionsPreferTrue({ "wk-set-5": true }, undefined);
    expect(merged["wk-set-5"]).toBe(true);
  });

  it("returns a new object (does not mutate local)", () => {
    const local = { a: true };
    const merged = mergeCompletionsPreferTrue(local, { b: true });
    expect(merged).not.toBe(local);
    expect(local).toEqual({ a: true });
    expect(merged).toEqual({ a: true, b: true });
  });
});

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
