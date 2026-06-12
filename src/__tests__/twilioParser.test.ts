import { describe, it, expect } from "vitest";
import { parseEightSleepSMS, parseWorkoutDone } from "@/lib/twilioParser";

describe("parseEightSleepSMS", () => {
  it("parses a full Eight Sleep text", () => {
    const msg = "Your Sleep Fitness Score is 86. You slept 8h 21m. Deep sleep: 14%. REM sleep: 35%. RHR: 61 bpm. HRV: 36 ms.";
    const result = parseEightSleepSMS(msg);
    expect(result).not.toBeNull();
    expect(result!.sleepFitnessScore).toBe(86);
    expect(result!.hrv).toBe(36);
    expect(result!.rhr).toBe(61);
    expect(result!.deepSleepPct).toBe(14);
    expect(result!.remSleepPct).toBe(35);
  });

  it("parses partial data", () => {
    const msg = "Your Sleep Fitness Score is 92.";
    const result = parseEightSleepSMS(msg);
    expect(result).not.toBeNull();
    expect(result!.sleepFitnessScore).toBe(92);
  });

  it("returns null for non-Eight Sleep messages", () => {
    expect(parseEightSleepSMS("DONE")).toBeNull();
    expect(parseEightSleepSMS("Hello world")).toBeNull();
    expect(parseEightSleepSMS("STATUS")).toBeNull();
  });
});

describe("parseWorkoutDone", () => {
  it("parses simple DONE", () => {
    const result = parseWorkoutDone("DONE");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("done");
    expect(result!.dayName).toBeUndefined();
    expect(result!.notes).toBeUndefined();
  });

  it("parses DONE with day name", () => {
    const result = parseWorkoutDone("DONE Monday");
    expect(result).not.toBeNull();
    expect(result!.dayName).toBe("Monday");
  });

  it("parses DONE with notes", () => {
    const result = parseWorkoutDone("DONE - felt great today");
    expect(result).not.toBeNull();
    expect(result!.notes).toBe("felt great today");
  });

  it("parses DONE with day and notes", () => {
    const result = parseWorkoutDone("DONE Tuesday - heavy session");
    expect(result).not.toBeNull();
    expect(result!.dayName).toBe("Tuesday");
    expect(result!.notes).toBe("heavy session");
  });

  it("is case-insensitive", () => {
    expect(parseWorkoutDone("done")).not.toBeNull();
    expect(parseWorkoutDone("Done")).not.toBeNull();
    expect(parseWorkoutDone("DONE")).not.toBeNull();
  });

  it("returns null for non-DONE messages", () => {
    expect(parseWorkoutDone("HELP")).toBeNull();
    expect(parseWorkoutDone("STATUS")).toBeNull();
    expect(parseWorkoutDone("Hello")).toBeNull();
  });
});
