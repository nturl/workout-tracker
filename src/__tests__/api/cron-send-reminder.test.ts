import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { NextRequest } from "next/server";

// Mock web-push to avoid real network calls
const mockSendNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

import { GET, POST } from "@/app/api/cron/send-reminder/route";

const CRON_SECRET = "test-cron-secret";

function makeGet(params?: Record<string, string>, auth?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/cron/send-reminder");
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new NextRequest(url, { method: "GET", headers });
}

function makePost(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new NextRequest("http://localhost:3000/api/cron/send-reminder", { method: "POST", headers });
}

function sub(endpoint: string) {
  return { endpoint, keys: { p256dh: "p", auth: "a" } };
}

describe("/api/cron/send-reminder (web push)", () => {
  beforeEach(() => {
    clearMockRedis();
    mockSendNotification.mockClear();
    mockSendNotification.mockResolvedValue(undefined);
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@test.com");
  });

  it("401s without auth on GET", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("401s on POST without auth", async () => {
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it("debug=1 returns status without auth", async () => {
    seedMockRedis({ "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]) });
    const res = await GET(makeGet({ debug: "1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toContain("web push");
    expect(data.subscribedUsers).toBe(1);
    expect(data.vapidKeysPresent).toBe(true);
    expect(data.vapidConfigOk).toBe(true);
  });

  it("test=1 dry run does not call web-push", async () => {
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": JSON.stringify({
        reminders: true,
        completions: true,
        streakAlerts: true,
        times: { Monday: "00:00", Tuesday: "00:00", Wednesday: "00:00", Thursday: "00:00", Friday: "00:00", Saturday: "00:00", Sunday: "00:00" },
        timezone: "UTC",
      }),
    });
    const res = await GET(makeGet({ test: "1", day: "Monday" }));
    expect(res.status).toBe(200);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("skips users with reminders disabled", async () => {
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": JSON.stringify({
        reminders: false,
        completions: true,
        streakAlerts: true,
        times: {},
      }),
    });
    const res = await GET(makeGet({}, `Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sent).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("sends when current tick is inside the 15-min window after reminder time", async () => {
    // Target = exactly now, so delta = 0 and the window [0, 15) matches.
    const now = new Date();
    const timeStr = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": JSON.stringify({
        reminders: true,
        completions: true,
        streakAlerts: true,
        times: { Monday: timeStr, Tuesday: timeStr, Wednesday: timeStr, Thursday: timeStr, Friday: timeStr, Saturday: timeStr, Sunday: timeStr },
        timezone: "UTC",
      }),
    });
    const res = await GET(makeGet({}, `Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eligible).toBe(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(data.sent).toBe(1);
  });

  it("does not send when current tick is outside the 15-min window", async () => {
    // Target 6 hours away so delta is far outside [0, 15).
    const targetHour = (new Date().getUTCHours() + 6) % 24;
    const timeStr = `${String(targetHour).padStart(2, "0")}:00`;
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": JSON.stringify({
        reminders: true,
        completions: true,
        streakAlerts: true,
        times: { Monday: timeStr, Tuesday: timeStr, Wednesday: timeStr, Thursday: timeStr, Friday: timeStr, Saturday: timeStr, Sunday: timeStr },
        timezone: "UTC",
      }),
    });
    const res = await GET(makeGet({}, `Bearer ${CRON_SECRET}`));
    const data = await res.json();
    expect(data.eligible).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("removes dead subscriptions on 410", async () => {
    const now = new Date();
    const timeStr = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": JSON.stringify({
        reminders: true,
        completions: true,
        streakAlerts: true,
        times: { Monday: timeStr, Tuesday: timeStr, Wednesday: timeStr, Thursday: timeStr, Friday: timeStr, Saturday: timeStr, Sunday: timeStr },
        timezone: "UTC",
      }),
    });
    mockSendNotification.mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }));
    const res = await GET(makeGet({}, `Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sent).toBe(0);
  });
});
