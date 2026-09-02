// @vitest-environment happy-dom
//
// NOTE: this repo's happy-dom test env does not expose window.localStorage,
// and zustand's `persist` middleware resolves its storage getter eagerly the
// first time the store module is evaluated (see lane-c.test.tsx's own note,
// and zustand/esm/middleware.mjs's createJSONStorage) - a stub assigned
// after that module has already been statically imported is too late. So
// useWorkoutStore is imported dynamically, after the localStorage stub is
// installed, instead of via a top-level static import.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: stub, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true, writable: true });
}

let useWorkoutStore: typeof import("@/hooks/useWorkoutStore")["useWorkoutStore"];
let setPersistAccount: typeof import("@/hooks/useWorkoutStore")["setPersistAccount"];
let storeKeyForAccount: typeof import("@/hooks/useWorkoutStore")["storeKeyForAccount"];
let LEGACY_STORE_KEY: typeof import("@/hooks/useWorkoutStore")["LEGACY_STORE_KEY"];
let emptyDirty: typeof import("@/hooks/useWorkoutStore")["emptyDirty"];
let seedDefaultHabits: typeof import("@/hooks/useWorkoutStore")["seedDefaultHabits"];

beforeAll(async () => {
  installLocalStorageStub();
  ({ useWorkoutStore, setPersistAccount, storeKeyForAccount, LEGACY_STORE_KEY, emptyDirty, seedDefaultHabits } =
    await import("@/hooks/useWorkoutStore"));
});

// ---------------------------------------------------------------------------
// B1 (pre-ship review BLOCKER): setPersistAccount() used to call
// useWorkoutStore.setState(freshAccountState()) BEFORE re-pointing persist at
// the incoming account's key. useWorkoutStore.setState is persist-wrapped —
// it writes to whatever key persist.getOptions().name is AT CALL TIME — so
// the empty reset blob was serialized straight over the OUTGOING account's
// real localStorage key, wiping its data and its unpushed `dirty` marks
// (which is what BUG-13's tombstones ride on). rehydrate() never repaired it
// because v5 -> v5 isn't a migration. Fixed by pointing persist at a scratch
// key for the duration of the in-memory reset, so neither the outgoing key
// nor the not-yet-rehydrated incoming key can be clobbered.
//
// Requires a real localStorage, unlike lane-e.test.ts's BUG-E1 (node env,
// where safeLocalStorage() always returns null and the whole
// adoption/persistence path is a no-op) — this test exercises the actual
// serialized-to-disk bytes, which is exactly where B1 lived.
// ---------------------------------------------------------------------------
describe("B1: setPersistAccount does not wipe the outgoing account's local data", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkoutStore.persist.setOptions({ name: LEGACY_STORE_KEY });
    useWorkoutStore.setState({
      completions: {},
      logs: {},
      level: "beginner",
      recoveryData: {},
      habits: {},
      habitDefs: seedDefaultHabits(),
      habitDefsVersion: 0,
      habitDefsDirty: false,
      dirty: emptyDirty(),
      habitFalseBackupV5: {},
      ouraLastSynced: null,
      eightSleepLastSynced: null,
    });
  });

  it("account A's dirty data and dirty marks survive switching to account B, and rehydrate back to A", async () => {
    await setPersistAccount("user-a");

    // A signs in and does offline gym taps — dirty, unpushed.
    useWorkoutStore.getState().toggleCompletion("mon-squat");
    useWorkoutStore.getState().saveLog("mon-squat", { notes: "A's private note" });

    const aKey = storeKeyForAccount("user-a");
    const beforeSwitchRaw = window.localStorage.getItem(aKey);
    expect(beforeSwitchRaw).toBeTruthy();
    const beforeSwitch = JSON.parse(beforeSwitchRaw!);
    expect(beforeSwitch.state.completions["mon-squat"]).toBe(true);
    expect(beforeSwitch.state.dirty.completions["mon-squat"]).toBe(true);
    expect(beforeSwitch.state.dirty.logs["mon-squat"]).toBe(true);

    // B signs in on the same device.
    await setPersistAccount("user-b");

    // The in-memory store is now B's fresh state...
    expect(useWorkoutStore.getState().completions["mon-squat"]).toBeUndefined();

    // ...but A's key on disk must be untouched: still A's data, still dirty.
    const afterSwitchRaw = window.localStorage.getItem(aKey);
    expect(afterSwitchRaw).toBeTruthy();
    const afterSwitch = JSON.parse(afterSwitchRaw!);
    expect(afterSwitch.state.completions["mon-squat"]).toBe(true);
    expect(afterSwitch.state.logs["mon-squat"]).toEqual({ notes: "A's private note" });
    expect(afterSwitch.state.dirty.completions["mon-squat"]).toBe(true);
    expect(afterSwitch.state.dirty.logs["mon-squat"]).toBe(true);

    // A signs back in: the data (and its dirty marks, so the next push still
    // sends it) must come back exactly as left, not as the empty blob B1
    // used to leave behind.
    await setPersistAccount("user-a");
    expect(useWorkoutStore.getState().completions["mon-squat"]).toBe(true);
    expect(useWorkoutStore.getState().logs["mon-squat"]).toEqual({ notes: "A's private note" });
    expect(useWorkoutStore.getState().dirty.completions["mon-squat"]).toBe(true);
    expect(useWorkoutStore.getState().dirty.logs["mon-squat"]).toBe(true);
  });

  it("legacy key adoption still works, and the legacy key itself is left intact", async () => {
    // Simulate an existing install: data already sitting under the
    // un-scoped legacy key, nothing claimed yet.
    const legacyBlob = JSON.stringify({
      state: {
        completions: { "existing-workout": true },
        logs: {},
        level: "beginner",
        theme: "system",
        recoveryData: {},
        habits: {},
        habitDefs: seedDefaultHabits(),
        habitDefsVersion: 0,
        habitDefsDirty: false,
        dirty: emptyDirty(),
        habitFalseBackupV5: {},
      },
      version: 5,
    });
    window.localStorage.setItem(LEGACY_STORE_KEY, legacyBlob);

    await setPersistAccount("user-c");

    // Adopted into the scoped key...
    const scopedKey = storeKeyForAccount("user-c");
    const scopedRaw = window.localStorage.getItem(scopedKey);
    expect(scopedRaw).toBeTruthy();
    expect(JSON.parse(scopedRaw!).state.completions["existing-workout"]).toBe(true);
    expect(window.localStorage.getItem("workout-store:adopted-by")).toBe("user-c");
    expect(useWorkoutStore.getState().completions["existing-workout"]).toBe(true);

    // ...and the legacy key itself was never blanked by the reset (the
    // "very first load of the new bundle" half of B1 the review flagged).
    const legacyRaw = window.localStorage.getItem(LEGACY_STORE_KEY);
    expect(legacyRaw).toBeTruthy();
    expect(JSON.parse(legacyRaw!).state.completions["existing-workout"]).toBe(true);
  });
});
