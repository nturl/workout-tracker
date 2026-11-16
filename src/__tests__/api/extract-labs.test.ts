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
vi.mock("@/lib/biomarkerStore", () => ({
  importLab: (...a: [string, { date: string }]) => importLab(...a),
}));

import { POST } from "@/app/api/extract-labs/route";

const IMG = "data:image/png;base64,AAAA";

function req(body: object): NextRequest {
  return new NextRequest("http://localhost:3000/api/extract-labs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch", "X-Forwarded-For": `t-${Math.random()}` },
    body: JSON.stringify(body),
  });
}

function ai(markers: unknown[]) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ labName: "Quest", reportDate: "2026-03-04", panelName: "Panel", markers }) }],
  };
}

async function run(markers: unknown[]) {
  create.mockResolvedValue(ai(markers));
  const res = await POST(req({ imageDataUrl: IMG }));
  return { res, json: await res.json() };
}

const imported = () => (importLab.mock.calls[0]?.[1] as unknown as { markers: { biomarkerId: string; value: number; unit: string }[] })?.markers;

beforeEach(() => {
  clearMockRedis();
  create.mockReset();
  importLab.mockClear();
  setMockUserId("test-user-123");
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("extract-labs: prompt", () => {
  it("lists the catalog as `id: name (unit)` lines and asks for name and id", async () => {
    await run([{ name: "Glucose", id: "glucose", value: 90, unit: "mg/dL" }]);
    const content = create.mock.calls[0][0].messages[0].content;
    const prompt = content.find((c: { type: string }) => c.type === "text").text as string;
    expect(prompt).toContain("glucose: Glucose (mg/dL)");
    expect(prompt).toContain("ldl: LDL Cholesterol (mg/dL)");
    expect(prompt).toMatch(/"id"/);
  });
});

describe("extract-labs: name matching", () => {
  it("accepts a valid catalog id even when the printed name matches nothing", async () => {
    const { json } = await run([{ name: "Cholesterol, Total", id: "total_cholesterol", value: 190, unit: "mg/dL" }]);
    expect(imported()).toEqual([expect.objectContaining({ biomarkerId: "total_cholesterol", value: 190 })]);
    expect(json.matched[0].originalName).toBe("Cholesterol, Total");
    expect(json.skipped).toEqual([]);
  });

  it("falls back to the printed name when the id is not in the catalog", async () => {
    await run([{ name: "Glucose", id: "made_up_id", value: 90, unit: "mg/dL" }]);
    expect(imported()).toEqual([expect.objectContaining({ biomarkerId: "glucose" })]);
  });

  it("skips and reports a marker with a null id and no name match", async () => {
    const { json } = await run([
      { name: "Glucose", id: "glucose", value: 90, unit: "mg/dL" },
      { name: "Zorblax Index", id: null, value: 3, unit: "U/L" },
    ]);
    expect(imported()).toHaveLength(1);
    expect(json.skipped).toEqual([{ name: "Zorblax Index", reason: "not tracked" }]);
    expect(json.stats).toMatchObject({ total: 2, matched: 1, skipped: 1 });
  });
});

describe("extract-labs: units", () => {
  it("stores the converted value in the catalog unit", async () => {
    const { json } = await run([{ name: "Glucose", id: "glucose", value: 5.0, unit: "mmol/L" }]);
    const [m] = imported();
    expect(m.value).toBeCloseTo(90.08, 2);
    expect(m.unit).toBe("mg/dL");
    expect(json.matched[0]).toMatchObject({ unit: "mg/dL" });
  });

  it("does not import a marker whose unit cannot be reconciled, and reports it", async () => {
    const { json } = await run([
      { name: "TSH", id: "tsh", value: 2, unit: "mg/L" },
      { name: "Glucose", id: "glucose", value: 90, unit: "mg/dL" },
    ]);
    expect(imported().map((m) => m.biomarkerId)).toEqual(["glucose"]);
    expect(json.skipped).toEqual([{ name: "TSH", reason: "unit mg/L not supported" }]);
  });
});

describe("extract-labs: non-numeric and nothing matched", () => {
  it("reports non-numeric values as not a number", async () => {
    const { json } = await run([
      { name: "CRP", id: "crp", value: "<0.3", unit: "mg/L" },
      { name: "Glucose", id: "glucose", value: 90, unit: "mg/dL" },
    ]);
    expect(json.skipped).toEqual([{ name: "CRP", reason: "not a number" }]);
    expect(json.stats).toEqual({ total: 2, matched: 1, skipped: 1 });
  });

  it("returns success with no lab and every marker skipped when nothing matches", async () => {
    const { res, json } = await run([{ name: "Zorblax", id: null, value: 1, unit: "U/L" }]);
    expect(res.status).toBe(200);
    expect(importLab).not.toHaveBeenCalled();
    expect(json.lab).toBeNull();
    expect(json.stats.matched).toBe(0);
    expect(json.skipped).toHaveLength(1);
  });
});
