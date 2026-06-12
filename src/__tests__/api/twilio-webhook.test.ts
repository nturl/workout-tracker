import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { POST } from "@/app/api/twilio/webhook/route";
import { NextRequest } from "next/server";

// Set to non-production to skip Twilio signature validation in tests
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

describe("POST /api/twilio/webhook", () => {
  beforeEach(() => {
    clearMockRedis();
  });

  it("handles DONE command", async () => {
    const res = await POST(makeTwilioRequest("DONE"));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain("marked as done");
  });

  it("handles DONE with day name", async () => {
    const res = await POST(makeTwilioRequest("DONE Monday"));
    const text = await res.text();
    expect(text).toContain("Monday");
    expect(text).toContain("marked as done");
  });

  it("handles DONE with notes", async () => {
    const res = await POST(makeTwilioRequest("DONE - felt great today"));
    const text = await res.text();
    expect(text).toContain("marked as done");
  });

  it("handles HELP command", async () => {
    const res = await POST(makeTwilioRequest("HELP"));
    const text = await res.text();
    expect(text).toContain("Commands");
  });

  it("handles ? command", async () => {
    const res = await POST(makeTwilioRequest("?"));
    const text = await res.text();
    expect(text).toContain("Commands");
  });

  it("handles STATUS command", async () => {
    const res = await POST(makeTwilioRequest("STATUS"));
    const text = await res.text();
    expect(text).toContain("Weekly Status");
  });

  it("returns help message for unknown input", async () => {
    const res = await POST(makeTwilioRequest("random nonsense"));
    const text = await res.text();
    expect(text).toContain("didn't understand");
  });

  it("returns XML content type", async () => {
    const res = await POST(makeTwilioRequest("HELP"));
    expect(res.headers.get("content-type")).toBe("text/xml");
  });

  it("associates completions with user when phone is mapped", async () => {
    // Use hash-based phone lookup
    const { hashPhone } = await import("@/lib/crypto");
    const hashed = hashPhone("+15551234567");
    seedMockRedis({
      [`phone-hash:${hashed}:userId`]: "user-abc",
    });
    const res = await POST(makeTwilioRequest("DONE"));
    const text = await res.text();
    expect(text).toContain("marked as done");
  });
});
