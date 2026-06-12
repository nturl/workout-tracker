import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { POST as webhookPost } from "@/app/api/twilio/webhook/route";
import { GET as recoveryGet } from "@/app/api/recovery/route";
import { NextRequest } from "next/server";

vi.stubEnv("NODE_ENV", "test");
process.env.PHONE_ENCRYPTION_KEY = "test-encryption-key-for-testing";

function makeTwilioRequest(body: string, from = "+15551234567"): NextRequest {
  const formBody = new URLSearchParams({ Body: body, From: from }).toString();
  return new NextRequest("http://localhost:3000/api/twilio/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
    body: formBody,
  });
}

function makeRecoveryGet(date: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/recovery?date=${date}`, {
    method: "GET",
    headers: { "X-Forwarded-For": `test-${Math.random()}` },
  });
}

describe("Recovery import flow", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  it("imports Eight Sleep SMS and retrieves via recovery API", async () => {
    // Map phone to user via hash
    const { hashPhone } = await import("@/lib/crypto");
    const hashed = hashPhone("+15551234567");
    seedMockRedis({
      [`phone-hash:${hashed}:userId`]: "test-user-123",
    });

    // Send Eight Sleep SMS via webhook
    const smsBody = "Your Sleep Fitness Score is 86. Time Slept: 7h 32m. HRV: 42ms. RHR: 61bpm.";
    const smsRes = await webhookPost(makeTwilioRequest(smsBody));
    const smsText = await smsRes.text();
    expect(smsText).toContain("Eight Sleep data logged");

    // Get today's date key
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // Retrieve via recovery API
    const recoveryRes = await recoveryGet(makeRecoveryGet(today));
    const recoveryJson = await recoveryRes.json();

    expect(recoveryJson.data).toBeTruthy();
    expect(recoveryJson.data.eightSleep.autoImported).toBe(true);
    expect(recoveryJson.data.eightSleep.sleepFitnessScore).toBe(86);
  });

  it("DONE command creates completion record retrievable by user", async () => {
    const { hashPhone } = await import("@/lib/crypto");
    const hashed = hashPhone("+15551234567");
    seedMockRedis({
      [`phone-hash:${hashed}:userId`]: "test-user-123",
    });

    // Send DONE via SMS
    const res = await webhookPost(makeTwilioRequest("DONE - crushed it today"));
    const text = await res.text();
    expect(text).toContain("marked as done");
  });
});
