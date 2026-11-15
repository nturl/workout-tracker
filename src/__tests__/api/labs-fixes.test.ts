import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/clerk";
import { setMockUserId } from "../mocks/clerk";
import { clearMockRedis } from "../mocks/redis";
import { NextRequest } from "next/server";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const importLab = vi.fn(async (_u: string, payload: { date: string }) => ({ id: "lab1", date: payload.date }));
const readings = vi.hoisted(() => ({ value: {} as Record<string, unknown[]> }));
vi.mock("@/lib/biomarkerStore", () => ({
  importLab: (...a: [string, { date: string }]) => importLab(...a),
  getAllReadings: vi.fn(async () => readings.value),
  getReadings: vi.fn(async () => []),
  getLabTests: vi.fn(async () => []),
}));

import { POST as extractPOST } from "@/app/api/extract-labs/route";
import { GET as goalsGET } from "@/app/api/health-goals/route";
import { GET as biomarkersGET } from "@/app/api/biomarkers/route";

const IMG = "data:image/png;base64,AAAA";

function extractReq(body: object): NextRequest {
  return new NextRequest("http://localhost:3000/api/extract-labs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch", "X-Forwarded-For": `t-${Math.random()}` },
    body: JSON.stringify(body),
  });
}
function getReq(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers: { "X-Forwarded-For": `t-${Math.random()}` } });
}
function aiText(obj: unknown, stop_reason = "end_turn") {
  return { stop_reason, content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }] };
}

beforeEach(() => {
  clearMockRedis();
  create.mockReset();
  importLab.mockClear();
  setMockUserId("test-user-123");
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("extract-labs", () => {
  const extraction = (reportDate: string | null) => ({
    labName: "Quest", reportDate, panelName: "CBC",
    markers: [{ name: "Glucose", value: 90, unit: "mg/dL", flag: null, refRange: "70-100" }],
  });

  it("uses the report's own date when no date is sent", async () => {
    create.mockResolvedValue(aiText(extraction("2026-03-04")));
    const res = await extractPOST(extractReq({ imageDataUrl: IMG }));
    expect(res.status).toBe(200);
    expect(importLab.mock.calls[0][1].date).toBe("2026-03-04");
  });

  it("falls back to today's date in America/New_York, not UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T02:00:00Z")); // 21:00 ET on the 15th
    try {
      create.mockResolvedValue(aiText(extraction(null)));
      await extractPOST(extractReq({ imageDataUrl: IMG }));
      expect(importLab.mock.calls[0][1].date).toBe("2026-11-15");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a clear error when the reply is truncated", async () => {
    create.mockResolvedValue(aiText('{"markers":[{"name":"Glu', "max_tokens"));
    const res = await extractPOST(extractReq({ imageDataUrl: IMG }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/too many results/i);
    expect(create.mock.calls[0][0].max_tokens).toBe(8000);
  });
});

describe("health-goals", () => {
  // Needs at least one marker so the route reaches the model call.
  beforeEach(() => {
    readings.value = {
      glucose: [{ date: "2026-01-01", value: 90, unit: "mg/dL", status: "optimal" }],
    };
  });

  it("returns a clean error on truncation and does not cache", async () => {
    create.mockResolvedValue(aiText('[{"title":"x"', "max_tokens"));
    const res = await goalsGET(getReq("/api/health-goals"));
    expect(res.status).toBe(422);
    expect(create.mock.calls[0][0].max_tokens).toBe(6000);
  });

  it("returns a clean error when the JSON does not parse", async () => {
    create.mockResolvedValue(aiText("[{broken}]"));
    const res = await goalsGET(getReq("/api/health-goals"));
    expect(res.status).toBe(422);
  });

  it("defaults missing actions / askAiQuestions to []", async () => {
    create.mockResolvedValue(aiText([{ title: "Goal", summary: "s" }]));
    const res = await goalsGET(getReq("/api/health-goals"));
    const { goals } = await res.json();
    expect(goals[0].actions).toEqual([]);
    expect(goals[0].askAiQuestions).toEqual([]);
  });
});

describe("biomarkers list trend", () => {
  it("passes the id so the list trend matches the detail trend", async () => {
    // Same status tier, value moves toward the optimal midpoint: only improving with the id.
    readings.value = {
      glucose: [
        { date: "2026-01-01", value: 76, unit: "mg/dL", status: "optimal" },
        { date: "2026-06-01", value: 82.5, unit: "mg/dL", status: "optimal" },
      ],
    };
    const res = await biomarkersGET(getReq("/api/biomarkers"));
    const { biomarkers } = await res.json();
    expect(biomarkers[0].trend).toBe("improving");
  });
});
