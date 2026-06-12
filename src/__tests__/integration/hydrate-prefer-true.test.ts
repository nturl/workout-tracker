import { describe, it, expect } from "vitest";
import { mergeCompletionsPreferTrue } from "@/hooks/useWorkoutStore";

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
