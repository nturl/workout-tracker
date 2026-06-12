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
});
