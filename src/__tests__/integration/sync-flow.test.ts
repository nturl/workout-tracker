import { describe, it, expect, beforeEach } from "vitest";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { GET, POST } from "@/app/api/sync/route";
import { NextRequest } from "next/server";

function makeGet(): NextRequest {
  return new NextRequest("http://localhost:3000/api/sync", {
    method: "GET",
    headers: { "X-Forwarded-For": `test-${Math.random()}` },
  });
}

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

describe("Sync flow integration", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  it("round-trips data: POST then GET returns merged data", async () => {
    // POST initial data
    await POST(makePost({
      completions: { "key-1": true },
      level: "beginner",
    }));

    // GET should return the data
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.data.completions["key-1"]).toBe(true);
    expect(json.data.level).toBe("beginner");
    expect(json.data.updatedAt).toBeDefined();
  });

  it("deep-merges recovery data across multiple POSTs", async () => {
    // POST Eight Sleep recovery
    await POST(makePost({
      recovery: {
        "2026-03-31": {
          date: "2026-03-31",
          eightSleep: { sleepFitnessScore: 86, hrv: 42 },
        },
      },
    }));

    // POST Oura recovery for same date
    await POST(makePost({
      recovery: {
        "2026-03-31": {
          date: "2026-03-31",
          oura: { readinessScore: 82 },
        },
      },
    }));

    // GET should have both sources merged
    const res = await GET(makeGet());
    const json = await res.json();
    const recovery = json.data.recovery["2026-03-31"];
    expect(recovery.eightSleep.sleepFitnessScore).toBe(86);
    expect(recovery.oura.readinessScore).toBe(82);
  });

  it("preserves existing data when updating a single field", async () => {
    // Seed with existing data
    seedMockRedis({
      "user:test-user-123:data": {
        completions: { "existing-key": true },
        level: "advanced",
      },
    });

    // POST only a new completion
    await POST(makePost({
      completions: { "new-key": true },
    }));

    // Should have both completions
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.data.completions["existing-key"]).toBe(true);
    expect(json.data.completions["new-key"]).toBe(true);
    expect(json.data.level).toBe("advanced");
  });
  // -------------------------------------------------------------------------
  // Delta pushes + tombstones (BUG-01). See the design note atop
  // src/app/api/sync/route.ts.
  // -------------------------------------------------------------------------

  it("a delta push only touches the keys it carries", async () => {
    seedMockRedis({
      "user:test-user-123:data": {
        completions: { "set-a": true, "set-b": true },
        habits: { meditation: { "2026-09-01": false } },
        level: "advanced",
      },
    });

    // A device that changed exactly one completion says exactly that.
    await POST(makePost({ syncMode: "delta", completions: { "set-c": true } }));

    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.data.completions).toEqual({ "set-a": true, "set-b": true, "set-c": true });
    // Untouched keys — including the explicit habit miss and the scalar level —
    // are exactly as they were.
    expect(json.data.habits.meditation["2026-09-01"]).toBe(false);
    expect(json.data.level).toBe("advanced");
  });

  it("a tombstone deletes a habit date back to unrecorded rather than to false", async () => {
    seedMockRedis({
      "user:test-user-123:data": {
        habits: { meditation: { "2026-08-31": true, "2026-09-01": false } },
      },
    });

    await POST(makePost({
      syncMode: "delta",
      tombstones: { habits: { meditation: ["2026-09-01"] } },
    }));

    const res = await GET(makeGet());
    const json = await res.json();
    expect("2026-09-01" in json.data.habits.meditation).toBe(false);
    expect(json.data.habits.meditation["2026-08-31"]).toBe(true);
  });

  it("tombstones also clear completions, logs and recovery dates, and are idempotent", async () => {
    seedMockRedis({
      "user:test-user-123:data": {
        completions: { "set-a": true, "set-b": true },
        logs: { "log-a": { notes: "keep" }, "log-b": { notes: "drop" } },
        recovery: { "2026-08-30": { date: "2026-08-30" }, "2026-08-31": { date: "2026-08-31" } },
      },
    });

    const body = {
      syncMode: "delta" as const,
      tombstones: {
        completions: ["set-b"],
        logs: ["log-b"],
        recovery: ["2026-08-31"],
      },
    };
    await POST(makePost(body));
    // A replay of the same push (retry, duplicate debounce) must be harmless.
    await POST(makePost(body));

    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.data.completions).toEqual({ "set-a": true });
    expect(Object.keys(json.data.logs)).toEqual(["log-a"]);
    expect(Object.keys(json.data.recovery)).toEqual(["2026-08-30"]);
  });

  it("a write and a tombstone for the same key in one push resolve deterministically (removal wins)", async () => {
    seedMockRedis({ "user:test-user-123:data": { completions: { "set-a": true } } });
    await POST(makePost({
      syncMode: "delta",
      completions: { "set-a": false },
      tombstones: { completions: ["set-a"] },
    }));
    const res = await GET(makeGet());
    const json = await res.json();
    expect("set-a" in json.data.completions).toBe(false);
  });

  it("still accepts a legacy full-map push from an older client bundle", async () => {
    // No syncMode marker: merged exactly the way it always was.
    await POST(makePost({ completions: { "key-1": true }, level: "beginner" }));
    await POST(makePost({ completions: { "key-1": true, "key-2": true }, level: "intermediate" }));

    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.data.completions).toEqual({ "key-1": true, "key-2": true });
    expect(json.data.level).toBe("intermediate");
  });
});
