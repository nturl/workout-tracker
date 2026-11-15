import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "../mocks/clerk";
import { setMockUserId } from "../mocks/clerk";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { NextRequest } from "next/server";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
vi.mock("@/lib/biomarkerStore", () => ({ getAllReadings: vi.fn(async () => ({})) }));

import { POST } from "@/app/api/chat/route";
import { getWeekProgress, isSessionScheduled, sessionKey } from "@/lib/helpers";
import { planForWeek } from "@/lib/workoutData";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
    body: JSON.stringify({ message: "what's my workout today?" }),
  });
}

async function systemPrompt(userData: unknown): Promise<string> {
  seedMockRedis({ "user:test-user-123:data": userData });
  const res = await POST(makeRequest());
  expect(res.status).toBe(200);
  return create.mock.calls[0][0].system as string;
}

describe("POST /api/chat system prompt", () => {
  beforeEach(() => {
    clearMockRedis();
    create.mockReset();
    create.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    setMockUserId("test-user-123");
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("strips screenshotDataUrl at any depth from the recovery entry", async () => {
    const prompt = await systemPrompt({
      recovery: {
        "2026-11-14": {
          date: "2026-11-14",
          oura: { readinessScore: 80, screenshotDataUrl: "data:image/jpeg;base64,AAAA" },
          eightSleep: { sleepFitnessScore: 70, screenshotDataUrl: "data:image/jpeg;base64,BBBB" },
        },
      },
    });
    expect(prompt).not.toContain("base64");
    expect(prompt).toContain('"readinessScore":80');
  });

  it("picks the latest recovery by date, not insertion order", async () => {
    const prompt = await systemPrompt({
      recovery: {
        "2026-11-14": { date: "2026-11-14", oura: { readinessScore: 91 } },
        "2026-11-02": { date: "2026-11-02", oura: { readinessScore: 33 } },
      },
    });
    expect(prompt).toContain('"readinessScore":91');
    expect(prompt).not.toContain('"readinessScore":33');
  });

  it("reports this week's done/total (ignoring other weeks and false entries) and today's date in New York", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-11-16 02:00 UTC = Sunday 2026-11-15 21:00 ET
    vi.setSystemTime(new Date("2026-11-16T02:00:00Z"));
    const thisWeek = "2026-11-15";
    const day = planForWeek(thisWeek)[0];
    const session = day.sessions.find((x) => isSessionScheduled(x, thisWeek))!;
    const total = getWeekProgress({}, thisWeek).total;
    const prompt = await systemPrompt({
      completions: {
        [sessionKey(thisWeek, day.day, session)]: true,
        // earlier weeks and false entries must not count
        [sessionKey("2026-11-08", day.day, session)]: true,
        "2026-11-08:Monday:conditioning": false,
        [sessionKey(thisWeek, "Monday", session)]: false,
      },
    });
    expect(prompt).toContain("Today is Sunday, 2026-11-15 (America/New_York)");
    expect(prompt).toContain(`Sessions completed this week: 1/${total}`);
  });
});
