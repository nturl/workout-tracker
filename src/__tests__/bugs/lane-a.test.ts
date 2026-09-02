import { describe, it, expect, beforeEach } from "vitest";
import { useWorkoutStore, migrateHabitsState, emptyDirty } from "@/hooks/useWorkoutStore";
import { clearMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { POST } from "@/app/api/sync/route";
import { NextRequest } from "next/server";

// Lane A - habit tracker data model, streaks, dates, sync merge.
// See notes/bugs/lane-a.md for the full report. Failing tests are wrapped in
// it.fails() so the suite stays green; each is tagged BUG-A<n> in its title.

function makePost(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
    body: JSON.stringify(body),
  });
}

async function post(body: Record<string, unknown>) {
  const res = await POST(makePost(body));
  return { status: res.status, json: await res.json() };
}

describe("BUG-A1: /api/sync POST last-write-wins on completion keys re-introduces the V19 P0 race server-side", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-a1");
  });

  // TEST REWRITTEN (fix lane S1). The original pinned an unachievable rule: it
  // asked a stateless server to tell a fresh `false` apart from a stale one
  // inside a full-map push, which is exactly the information a full-map push
  // destroys (and BUG-A2 below asks for the OPPOSITE answer from the same
  // shape, so no leaf rule can satisfy both). The fix removes the ambiguity at
  // the source: a device now sends only the keys it actually changed
  // (`syncMode: "delta"`), so a device that did not touch this key does not
  // mention it. Same scenario, expressed the way the client now pushes.
  it("a completed set pushed by device A is not erased by a later push from a device that did not touch it", async () => {
    // Device A completes a set at the gym and pushes that one changed key.
    const a = await post({
      syncMode: "delta",
      completions: { "2026-09-01-monday-strength-set1": true },
    });
    expect(a.status).toBe(200);

    // Device B's debounced push fires. Its snapshot of this key is stale, but
    // it never CHANGED the key, so the key is simply absent from its delta —
    // the only thing B reports is the completion it really did tap.
    const b = await post({
      syncMode: "delta",
      completions: { "2026-09-01-monday-mobility-set1": true },
    });
    expect(b.status).toBe(200);

    const stateRaw = await import("../mocks/redis").then((m) => m.getMockRedis().get("user:test-user-a1:data"));
    const stored = JSON.parse((await stateRaw) as string);
    expect(stored.completions["2026-09-01-monday-strength-set1"]).toBe(true);
    expect(stored.completions["2026-09-01-monday-mobility-set1"]).toBe(true);
  });
});

describe("BUG-A2: /api/sync POST last-write-wins on habit date keys clobbers an explicit miss", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-a2");
  });

  // TEST REWRITTEN (fix lane S1), same reason as BUG-A1 above: expressed as the
  // delta push the client now sends. A stale device no longer restates habit
  // dates it did not edit, so the explicit miss stands.
  it("an explicit false (missed) set by device A survives a later push from a stale device that did not edit that date", async () => {
    // Device A marks "meditation" explicitly MISSED today and pushes that key.
    const a = await post({ syncMode: "delta", habits: { meditation: { "2026-09-01": false } } });
    expect(a.status).toBe(200);

    // Device B never saw A's push. Its own edit is a different habit/date, and
    // that is all its delta carries.
    const b = await post({ syncMode: "delta", habits: { walk: { "2026-09-01": true } } });
    expect(b.status).toBe(200);

    const stateRaw = await import("../mocks/redis").then((m) => m.getMockRedis().get("user:test-user-a2:data"));
    const stored = JSON.parse((await stateRaw) as string);
    expect(stored.habits.meditation["2026-09-01"]).toBe(false);
    expect(stored.habits.walk["2026-09-01"]).toBe(true);
  });
});

describe("BUG-A3: hydrateFromSync prefer-true merge overwrites a local explicit miss with stale incoming true", () => {
  beforeEach(() => {
    useWorkoutStore.setState({
      habits: {},
      habitDefs: useWorkoutStore.getState().habitDefs,
      habitDefsVersion: 0,
      habitDefsDirty: false,
      dirty: emptyDirty(),
    });
  });

  it("a locally-recorded false (explicitly missed) stays false after hydrating incoming true for the same date", () => {
    // Tapping "missed" goes through setHabit, which is what marks the date
    // dirty — i.e. "this device changed it and the server has not acked it".
    useWorkoutStore.getState().setHabit("meditation", "2026-09-01", false);

    useWorkoutStore.getState().hydrateFromSync({
      habits: { meditation: { "2026-09-01": true } },
    });

    // mergeDailyHabit inside hydrateFromSync used to do
    // `Boolean(merged[date]) || Boolean(value)` — the prefer-true rule from
    // plain workout completions, which predates the tri-state "explicit miss"
    // (989297d). It now applies dirty-wins instead: a date this device changed
    // and has not had acked keeps its local value; everything else takes the
    // server's.
    expect(useWorkoutStore.getState().habits.meditation["2026-09-01"]).toBe(false);
  });
});

describe("BUG-A4: migrateHabitsState does not repair an empty habitDefs array already at version 2", () => {
  it.fails("seeds default habits for a v2-persisted user whose habitDefs is an empty array", () => {
    // The v1->v2 migration block (`if (version < 2)`) is the only place that
    // seeds habitDefs when empty. A user whose persisted version is already 2
    // (so `version < 2` is false) but whose habitDefs somehow ended up []
    // (e.g. a wiped/corrupted localStorage value) skips that block entirely
    // and the v2->v3 block does not check for emptiness either.
    const out = migrateHabitsState(
      { habitDefs: [], habits: {}, habitDefsVersion: 0 },
      2,
    ) as Record<string, unknown>;

    expect(Array.isArray(out.habitDefs)).toBe(true);
    expect((out.habitDefs as unknown[]).length).toBeGreaterThan(0);
  });
});
