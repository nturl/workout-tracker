import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis } from "../mocks/redis";

const mockSendNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

import {
  saveSubscription,
  getSubscriptions,
  removeSubscription,
  getPreferences,
  savePreferences,
  sendPush,
  listSubscribedUsers,
  DEFAULT_PUSH_PREFS,
} from "@/lib/webpush";

const SUB_A = { endpoint: "https://push.example/a", keys: { p256dh: "pa", auth: "aa" } };
const SUB_B = { endpoint: "https://push.example/b", keys: { p256dh: "pb", auth: "ab" } };

describe("webpush lib", () => {
  beforeEach(() => {
    clearMockRedis();
    mockSendNotification.mockClear();
    mockSendNotification.mockResolvedValue(undefined);
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "p");
    vi.stubEnv("VAPID_PRIVATE_KEY", "s");
    vi.stubEnv("VAPID_SUBJECT", "mailto:t@t.com");
  });

  it("stores and retrieves subscriptions", async () => {
    await saveSubscription("u1", SUB_A);
    const subs = await getSubscriptions("u1");
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe(SUB_A.endpoint);
  });

  it("deduplicates subscriptions by endpoint", async () => {
    await saveSubscription("u1", SUB_A);
    await saveSubscription("u1", SUB_A); // same endpoint
    const subs = await getSubscriptions("u1");
    expect(subs).toHaveLength(1);
  });

  it("supports multiple devices", async () => {
    await saveSubscription("u1", SUB_A);
    await saveSubscription("u1", SUB_B);
    const subs = await getSubscriptions("u1");
    expect(subs).toHaveLength(2);
  });

  it("removes subscriptions", async () => {
    await saveSubscription("u1", SUB_A);
    await saveSubscription("u1", SUB_B);
    await removeSubscription("u1", SUB_A.endpoint);
    const subs = await getSubscriptions("u1");
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe(SUB_B.endpoint);
  });

  it("returns DEFAULT_PUSH_PREFS when none saved", async () => {
    const prefs = await getPreferences("u1");
    expect(prefs).toEqual(DEFAULT_PUSH_PREFS);
  });

  it("merges partial preference updates", async () => {
    await savePreferences("u1", { reminders: false });
    const prefs = await getPreferences("u1");
    expect(prefs.reminders).toBe(false);
    expect(prefs.completions).toBe(true);
    expect(prefs.times.Monday).toBe(DEFAULT_PUSH_PREFS.times.Monday);
  });

  it("sendPush: calls web-push for each subscription", async () => {
    await saveSubscription("u1", SUB_A);
    await saveSubscription("u1", SUB_B);
    const result = await sendPush("u1", { title: "hi", body: "x" });
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(2);
  });

  it("sendPush: removes subscription on 410 Gone", async () => {
    await saveSubscription("u1", SUB_A);
    mockSendNotification.mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }));
    const result = await sendPush("u1", { title: "hi", body: "x" });
    expect(result.removed).toBe(1);
    const subs = await getSubscriptions("u1");
    expect(subs).toHaveLength(0);
  });

  it("sendPush: does not remove on other errors", async () => {
    await saveSubscription("u1", SUB_A);
    mockSendNotification.mockRejectedValueOnce(Object.assign(new Error("Server error"), { statusCode: 500 }));
    const result = await sendPush("u1", { title: "hi", body: "x" });
    expect(result.failed).toBe(1);
    expect(result.removed).toBe(0);
    const subs = await getSubscriptions("u1");
    expect(subs).toHaveLength(1);
  });

  it("listSubscribedUsers returns userIds with active subscriptions", async () => {
    await saveSubscription("alice", SUB_A);
    await saveSubscription("bob", SUB_B);
    const users = await listSubscribedUsers();
    expect(users.sort()).toEqual(["alice", "bob"]);
  });
});
