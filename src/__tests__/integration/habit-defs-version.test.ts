import { describe, it, expect, beforeEach } from "vitest";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { GET, POST } from "@/app/api/sync/route";
import { NextRequest } from "next/server";
import type { HabitDef } from "@/lib/habits";

// Server-authoritative habitDefs versioning. The server mints the version (CAS
// on the client's base version), so a clock-skewed device can no longer win
// merges or strand a correctly-versioned device's edit.

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

async function post(body: Record<string, unknown>) {
  const res = await POST(makePost(body));
  return { status: res.status, json: await res.json() };
}

const LIST_A: HabitDef[] = [{ id: "meditation", label: "Meditation" }];
const LIST_S: HabitDef[] = [{ id: "gambling", label: "Stale list" }];
const LIST_A2: HabitDef[] = [{ id: "meditation", label: "Meditation" }, { id: "walk", label: "Walk" }];

describe("habitDefs server-assigned versioning", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  it("assigns version 1 to the first stored list", async () => {
    const { json } = await post({ habitDefs: LIST_A, habitDefsVersion: 0 });
    expect(json.success).toBe(true);
    expect(json.habitDefs).toEqual(LIST_A);
    expect(json.habitDefsVersion).toBe(1);
  });

  it("a stale-based device cannot strand a correctly-versioned device's later edit", async () => {
    // Device A makes the canonical edit; server mints version 1.
    const a1 = await post({ habitDefs: LIST_A, habitDefsVersion: 0 });
    expect(a1.json.habitDefsVersion).toBe(1);

    // Stale device S (never saw v1, e.g. it had a skewed clock under the old
    // design) pushes a DIFFERENT list based on the old version 0. Rejected: the
    // server keeps A's list and tells S the canonical state so S converges.
    const s = await post({ habitDefs: LIST_S, habitDefsVersion: 0 });
    expect(s.json.habitDefs).toEqual(LIST_A);
    expect(s.json.habitDefsVersion).toBe(1);

    // Device A makes a LATER edit based on the version it adopted (1). Accepted.
    const a2 = await post({ habitDefs: LIST_A2, habitDefsVersion: 1 });
    expect(a2.json.habitDefs).toEqual(LIST_A2);
    expect(a2.json.habitDefsVersion).toBe(2);

    // Canonical state is A's later edit, not the stale device's list.
    const res = await GET(makeGet());
    const { data } = await res.json();
    expect(data.habitDefs).toEqual(LIST_A2);
    expect(data.habitDefsVersion).toBe(2);
  });

  it("does not bump the version on an idempotent re-push of the same list", async () => {
    await post({ habitDefs: LIST_A, habitDefsVersion: 0 }); // -> v1
    const echo = await post({ habitDefs: LIST_A, habitDefsVersion: 1 }); // same content
    expect(echo.json.habitDefsVersion).toBe(1);
    const echo2 = await post({ habitDefs: LIST_A, habitDefsVersion: 0 }); // stale base, same content
    expect(echo2.json.habitDefsVersion).toBe(1);
  });

  it("drops the dead client-clock field and replaces it with a server version", async () => {
    // An old blob carrying a far-future habitDefsUpdatedAt (the original bug).
    seedMockRedis({
      "user:test-user-123:data": {
        habitDefs: LIST_A,
        habitDefsUpdatedAt: 9_999_999_999_999,
      },
    });
    // A new-code client pushes a real edit based on version 0.
    const r = await post({ habitDefs: LIST_A2, habitDefsVersion: 0 });
    expect(r.json.habitDefsVersion).toBe(1);

    const res = await GET(makeGet());
    const { data } = await res.json();
    expect(data.habitDefsUpdatedAt).toBeUndefined();
    expect(data.habitDefsVersion).toBe(1);
    expect(data.habitDefs).toEqual(LIST_A2);
  });
});
