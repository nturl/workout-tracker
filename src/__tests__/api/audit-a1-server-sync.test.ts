import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearMockRedis, getMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { NextRequest } from "next/server";

// Gate the Oura fetch so a /api/sync push can land while the sync is "awaiting Oura".
let release: () => void;
let gate: Promise<void>;
vi.mock("@/lib/oura", () => ({
  fetchDailyData: vi.fn(async () => {
    await gate;
    return { readinessScore: 80 };
  }),
}));
vi.mock("@/lib/oauthTokens", () => ({ getTokens: vi.fn(async () => ({ accessToken: "a" })) }));

import { POST as ouraSync } from "@/app/api/oura/sync/route";
import { GET as cronSyncRecovery } from "@/app/api/cron/sync-recovery/route";
import { POST as syncPost, GET as syncGet } from "@/app/api/sync/route";
import { rateLimit } from "@/lib/rateLimit";

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost" + url, {
    method,
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch", "X-Forwarded-For": `t-${Math.random()}`, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const stored = async () => JSON.parse((await getMockRedis().get("user:u1:data"))!);

beforeEach(() => {
  clearMockRedis();
  setMockUserId("u1");
  gate = new Promise<void>((r) => (release = r));
});

describe("F2: external syncs merge instead of overwriting the blob", () => {
  it("oura/sync keeps a /api/sync push that lands while it awaits Oura", async () => {
    seedMockRedis({ "user:u1:data": { completions: {}, level: "beginner" } });
    const p = ouraSync(req("POST", "/api/oura/sync"));
    await new Promise((r) => setTimeout(r, 20));
    expect((await syncPost(req("POST", "/api/sync", { syncMode: "delta", completions: { k: true } }))).status).toBe(200);
    release();
    await p;
    const d = await stored();
    expect(d.completions.k).toBe(true);
    expect(d.recovery[Object.keys(d.recovery)[0]].oura.readinessScore).toBe(80);
  });

  it("cron sync-recovery keeps a /api/sync push that lands while it awaits Oura", async () => {
    process.env.CRON_SECRET = "s";
    seedMockRedis({ "user:u1:data": { completions: {} }, "user:u1:oauth:oura": "{}" });
    const p = cronSyncRecovery(req("GET", "/api/cron/sync-recovery", undefined, { authorization: "Bearer s" }));
    await new Promise((r) => setTimeout(r, 20));
    await syncPost(req("POST", "/api/sync", { syncMode: "delta", completions: { k: true } }));
    release();
    await p;
    expect((await stored()).completions.k).toBe(true);
  });
});

describe("F3: one invalid entry does not reject the whole push", () => {
  it("drops an over-long log note but still stores completions and the other log", async () => {
    const res = await syncPost(req("POST", "/api/sync", {
      syncMode: "delta",
      completions: { a: true },
      logs: { bad: { notes: "x".repeat(2001) }, good: { notes: "ok" } },
    }));
    expect(res.status).toBe(200);
    const d = await stored();
    expect(d.completions.a).toBe(true);
    expect(d.logs.good.notes).toBe("ok");
    expect(d.logs.bad).toBeUndefined();
  });

  it("drops a recovery entry with a null score but keeps completions", async () => {
    const res = await syncPost(req("POST", "/api/sync", {
      syncMode: "delta",
      completions: { a: true },
      recovery: { "2026-10-14": { date: "2026-10-14", oura: { readinessScore: null, hrv: 40 } } },
    }));
    expect(res.status).toBe(200);
    expect((await stored()).completions.a).toBe(true);
  });

  it("still 400s a structurally invalid body", async () => {
    expect((await syncPost(req("POST", "/api/sync", { level: "expert" }))).status).toBe(400);
    expect((await syncPost(req("POST", "/api/sync", { logs: [1, 2] }))).status).toBe(400);
  });
});

describe("F4: cleared fields leave the server", () => {
  it("replaces logs[key] wholesale so a cleared exercise weight is removed", async () => {
    await syncPost(req("POST", "/api/sync", { syncMode: "delta", logs: { k: { notes: "n", exerciseLogs: { bench: { weight: 100, reps: 8 } } } } }));
    await syncPost(req("POST", "/api/sync", { syncMode: "delta", logs: { k: { notes: "n", exerciseLogs: { bench: { reps: 8 } } } } }));
    const d = (await (await syncGet(req("GET", "/api/sync"))).json()).data;
    expect(d.logs.k.exerciseLogs.bench.weight).toBeUndefined();
  });

  it("replaces recovery[date] wholesale so a removed screenshot is removed", async () => {
    const day = (eightSleep: object) => ({ syncMode: "delta", recovery: { "2026-10-14": { date: "2026-10-14", eightSleep } } });
    await syncPost(req("POST", "/api/sync", day({ screenshotDataUrl: "data:x", sleepFitnessScore: 80 })));
    await syncPost(req("POST", "/api/sync", day({ sleepFitnessScore: 80 })));
    expect((await stored()).recovery["2026-10-14"].eightSleep.screenshotDataUrl).toBeUndefined();
  });

  it("still merges other keys additively", async () => {
    await syncPost(req("POST", "/api/sync", { syncMode: "delta", logs: { a: { notes: "a" } } }));
    await syncPost(req("POST", "/api/sync", { syncMode: "delta", logs: { b: { notes: "b" } } }));
    const d = await stored();
    expect(d.logs.a.notes).toBe("a");
    expect(d.logs.b.notes).toBe("b");
  });
});

describe("F11: rate limit is keyed by route and IP", () => {
  it("heavy use of one route does not consume another route's budget", () => {
    const mk = (path: string) => new NextRequest("http://localhost" + path, { headers: { "x-forwarded-for": "1.2.3.4" } });
    for (let i = 0; i < 55; i++) rateLimit(mk("/api/other"), { limit: 120, windowMs: 60_000 });
    const results = Array.from({ length: 10 }, () => rateLimit(mk("/api/sync"), { limit: 60, windowMs: 60_000 }).success);
    expect(results.every(Boolean)).toBe(true);
  });
});
