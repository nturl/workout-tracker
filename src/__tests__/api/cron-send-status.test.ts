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

// Make the local clock deterministic so the 14:00/18:00 windows are testable.
// buildStatusPayload and the rest of the module stay real.
vi.mock("@/lib/reminderMessage", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/reminderMessage");
  return { ...actual, localTimeParts: vi.fn(() => ({ day: "Monday", hhmm: "14:00" })) };
});

import { GET, POST } from "@/app/api/cron/send-status/route";
import { localTimeParts, dateKeyInTimezone } from "@/lib/reminderMessage";

const CRON_SECRET = "test-cron-secret";

function makeGet(params?: Record<string, string>, auth?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/cron/send-status");
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new NextRequest(url, { method: "GET", headers });
}

function makePost(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new NextRequest("http://localhost:3000/api/cron/send-status", { method: "POST", headers });
}

function sub(endpoint: string) {
  return { endpoint, keys: { p256dh: "p", auth: "a" } };
}

function prefs(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ reminders: true, completions: true, streakAlerts: true, times: {}, timezone: "UTC", ...overrides });
}

// Sunday of the current UTC week, matching weekStartKey in reminderMessage.
function currentWeekKey(): string {
  const dateKey = dateKeyInTimezone("UTC", new Date());
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

describe("/api/cron/send-status (web push)", () => {
  beforeEach(() => {
    clearMockRedis();
    mockSendNotification.mockClear();
    mockSendNotification.mockResolvedValue(undefined);
    vi.mocked(localTimeParts).mockReturnValue({ day: "Monday", hhmm: "14:00" });
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@test.com");
  });

  it("401s without auth on GET and POST", async () => {
    expect((await GET(makeGet())).status).toBe(401);
    expect((await POST(makePost())).status).toBe(401);
  });

  it("debug=1 returns status without auth", async () => {
    seedMockRedis({ "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]) });
    const res = await GET(makeGet({ debug: "1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toContain("Status check-in");
    expect(data.checkpoints).toEqual({ afternoon: "14:00", evening: "18:00" });
  });

  it("test=1 dry run does not call web-push", async () => {
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": prefs(),
    });
    const res = await GET(makeGet({ test: "1", day: "Monday", checkpoint: "afternoon" }));
    expect(res.status).toBe(200);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("skips users with completion alerts disabled", async () => {
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": prefs({ completions: false }),
    });
    const res = await GET(makeGet({}, `Bearer ${CRON_SECRET}`));
    const data = await res.json();
    expect(data.sent).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("sends an afternoon check-in when inside the 14:00 window", async () => {
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": prefs(),
    });
    const res = await GET(makeGet({}, `Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eligible).toBe(1);
    expect(data.sent).toBe(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
  });

  it("does not send when no check-in window matches", async () => {
    vi.mocked(localTimeParts).mockReturnValue({ day: "Monday", hhmm: "09:30" });
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": prefs(),
    });
    const res = await GET(makeGet({}, `Bearer ${CRON_SECRET}`));
    const data = await res.json();
    expect(data.eligible).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("reports what's left when nothing is logged", async () => {
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": prefs(),
    });
    const res = await GET(makeGet({ test: "1", day: "Monday", checkpoint: "afternoon" }));
    const data = await res.json();
    const detail = data.details.find((d: { reason: string }) => d.reason.includes("would send"));
    expect(detail.reason).toContain("Super-Slow Strength");
    expect(detail.reason).toContain("Nothing logged yet");
  });

  it("reports all done when the day's session is completed", async () => {
    const key = `${currentWeekKey()}:Monday:super-slow-strength`;
    seedMockRedis({
      "user:u1:push-subs": JSON.stringify([sub("https://example.com/1")]),
      "user:u1:push-prefs": prefs(),
      "user:u1:state": JSON.stringify({ completions: { [key]: true } }),
    });
    const res = await GET(makeGet({ test: "1", day: "Monday", checkpoint: "evening" }));
    const data = await res.json();
    const detail = data.details.find((d: { reason: string }) => d.reason.includes("would send"));
    expect(detail.reason).toContain("All 1 done");
    expect(detail.reason).toContain("evening check-in");
  });
});
