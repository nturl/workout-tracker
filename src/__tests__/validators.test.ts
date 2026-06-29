import { describe, it, expect } from "vitest";
import { syncBodySchema, recoveryActionSchema, logEntrySchema } from "@/lib/validators";

describe("syncBodySchema", () => {
  it("accepts valid sync data", () => {
    const result = syncBodySchema.safeParse({
      completions: { "2026-03-22:Monday:super-slow-strength": true },
      logs: { "2026-03-22:Monday:super-slow-strength": { feeling: 4, duration: 30 } },
      level: "intermediate",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = syncBodySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid level", () => {
    const result = syncBodySchema.safeParse({ level: "expert" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid feeling value", () => {
    const result = syncBodySchema.safeParse({
      logs: { key: { feeling: 10 } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid habitDefs with a version", () => {
    const result = syncBodySchema.safeParse({
      habitDefs: [
        { id: "morning-run", label: "Morning Run" },
        { id: "supplementsAm", label: "Supplements (AM)" },
      ],
      habitDefsVersion: 7,
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 30 habitDefs", () => {
    const habitDefs = Array.from({ length: 31 }, (_, i) => ({ id: `h${i}`, label: `Habit ${i}` }));
    expect(syncBodySchema.safeParse({ habitDefs }).success).toBe(false);
  });

  it("rejects a habit id with illegal characters", () => {
    expect(syncBodySchema.safeParse({ habitDefs: [{ id: "bad id!", label: "Bad" }] }).success).toBe(false);
  });

  it("rejects a habit id over 64 chars", () => {
    expect(syncBodySchema.safeParse({ habitDefs: [{ id: "a".repeat(65), label: "Too long" }] }).success).toBe(false);
  });

  it("rejects a habit label over 100 chars", () => {
    expect(syncBodySchema.safeParse({ habitDefs: [{ id: "ok", label: "a".repeat(101) }] }).success).toBe(false);
  });

  it("rejects an empty habit label", () => {
    expect(syncBodySchema.safeParse({ habitDefs: [{ id: "ok", label: "" }] }).success).toBe(false);
  });

  it("rejects a negative habitDefsVersion", () => {
    expect(syncBodySchema.safeParse({ habitDefsVersion: -1 }).success).toBe(false);
  });

  it("rejects a non-integer habitDefsVersion", () => {
    expect(syncBodySchema.safeParse({ habitDefsVersion: 1.5 }).success).toBe(false);
  });
});

describe("recoveryActionSchema", () => {
  it("accepts set-phone action", () => {
    const result = recoveryActionSchema.safeParse({
      action: "set-phone",
      phone: "5551234567",
    });
    expect(result.success).toBe(true);
  });

  it("rejects set-phone with short number", () => {
    const result = recoveryActionSchema.safeParse({
      action: "set-phone",
      phone: "123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts get-phone action", () => {
    const result = recoveryActionSchema.safeParse({ action: "get-phone" });
    expect(result.success).toBe(true);
  });

  it("accepts get-completions action", () => {
    const result = recoveryActionSchema.safeParse({ action: "get-completions" });
    expect(result.success).toBe(true);
  });

  it("accepts test-sms action", () => {
    const result = recoveryActionSchema.safeParse({ action: "test-sms" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown action", () => {
    const result = recoveryActionSchema.safeParse({ action: "delete-everything" });
    expect(result.success).toBe(false);
  });
});

describe("logEntrySchema", () => {
  it("accepts valid log entry", () => {
    const result = logEntrySchema.safeParse({
      notes: "Great session",
      duration: 30,
      feeling: 4,
      completedAt: "2026-03-30T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty log entry", () => {
    const result = logEntrySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects notes over 2000 chars", () => {
    const result = logEntrySchema.safeParse({
      notes: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative duration", () => {
    const result = logEntrySchema.safeParse({
      duration: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects feeling outside 1-5", () => {
    expect(logEntrySchema.safeParse({ feeling: 0 }).success).toBe(false);
    expect(logEntrySchema.safeParse({ feeling: 6 }).success).toBe(false);
  });
});
