/**
 * Web Push - browser-native push notifications.
 * Replaces ntfy.sh. Users grant permission once, no third-party app needed.
 *
 * Storage model in Redis:
 *   user:{userId}:push-subs -> JSON array of PushSubscriptionJSON
 *   user:{userId}:push-prefs -> JSON PushPreferences
 */

import webpush from "web-push";
import { getRedis } from "./redis";

let configured = false;
let configError: string | null = null;

function normalizeSubject(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("mailto:") || s.startsWith("https://") || s.startsWith("http://")) return s;
  if (s.includes("@")) return `mailto:${s}`;
  return `https://${s}`;
}

function configure() {
  if (configured || configError) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const rawSubject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    configError = "VAPID keys missing (NEXT_PUBLIC_VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY not set)";
    return;
  }

  const subject = normalizeSubject(rawSubject);
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    configError = `VAPID setVapidDetails failed: ${msg} | subject="${subject}" publicKeyLen=${publicKey.length} privateKeyLen=${privateKey.length}`;
    console.error(configError);
  }
}

export function getPushConfigStatus(): { ok: boolean; error: string | null } {
  configure();
  return { ok: configured, error: configError };
}

export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPreferences {
  reminders: boolean;
  completions: boolean;
  streakAlerts: boolean;
  // Per-day local time HH:mm for reminders
  times: Record<string, string>;
  // IANA timezone string, e.g. "America/Los_Angeles"
  timezone?: string;
}

export const DEFAULT_PUSH_PREFS: PushPreferences = {
  reminders: true,
  completions: true,
  streakAlerts: true,
  times: {
    Monday: "07:00", Tuesday: "07:00", Wednesday: "07:00",
    Thursday: "07:00", Friday: "07:00", Saturday: "09:00", Sunday: "09:00",
  },
};

function subsKey(userId: string) { return `user:${userId}:push-subs`; }
function prefsKey(userId: string) { return `user:${userId}:push-prefs`; }

export async function getSubscriptions(userId: string): Promise<PushSubscriptionJSON[]> {
  const redis = getRedis();
  const raw = await redis.get(subsKey(userId));
  if (!raw) return [];
  try { return JSON.parse(raw) as PushSubscriptionJSON[]; } catch { return []; }
}

export async function saveSubscription(userId: string, sub: PushSubscriptionJSON): Promise<void> {
  const redis = getRedis();
  const existing = await getSubscriptions(userId);
  // Dedupe on endpoint — same device re-subscribing replaces the old record
  const filtered = existing.filter((s) => s.endpoint !== sub.endpoint);
  filtered.push(sub);
  await redis.set(subsKey(userId), JSON.stringify(filtered));
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  const redis = getRedis();
  const existing = await getSubscriptions(userId);
  const filtered = existing.filter((s) => s.endpoint !== endpoint);
  if (filtered.length === 0) {
    await redis.del(subsKey(userId));
  } else {
    await redis.set(subsKey(userId), JSON.stringify(filtered));
  }
}

export async function getPreferences(userId: string): Promise<PushPreferences> {
  const redis = getRedis();
  const raw = await redis.get(prefsKey(userId));
  if (!raw) return DEFAULT_PUSH_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<PushPreferences>;
    return { ...DEFAULT_PUSH_PREFS, ...parsed, times: { ...DEFAULT_PUSH_PREFS.times, ...(parsed.times || {}) } };
  } catch {
    return DEFAULT_PUSH_PREFS;
  }
}

export async function savePreferences(userId: string, prefs: Partial<PushPreferences>): Promise<PushPreferences> {
  const redis = getRedis();
  const current = await getPreferences(userId);
  const next = { ...current, ...prefs, times: { ...current.times, ...(prefs.times || {}) } };
  await redis.set(prefsKey(userId), JSON.stringify(next));
  return next;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
  badge?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

export interface SendResult {
  sent: number;
  failed: number;
  removed: number;
  errors: string[];
}

/**
 * Send a push notification to all of a user's subscriptions.
 * Automatically removes subscriptions that return 404/410 (browser unsubscribed).
 */
export async function sendPush(userId: string, payload: PushPayload): Promise<SendResult> {
  configure();
  const result: SendResult = { sent: 0, failed: 0, removed: 0, errors: [] };
  if (!configured) {
    result.errors.push(configError || "VAPID not configured");
    result.failed = 1;
    return result;
  }
  const subs = await getSubscriptions(userId);
  if (subs.length === 0) return result;

  const json = JSON.stringify(payload);
  const deadEndpoints: string[] = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, json, { TTL: 60 * 60 * 12 });
      result.sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        deadEndpoints.push(sub.endpoint);
        result.removed++;
      } else {
        result.failed++;
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }));

  if (deadEndpoints.length > 0) {
    for (const endpoint of deadEndpoints) {
      await removeSubscription(userId, endpoint);
    }
  }

  return result;
}

/**
 * List all userIds that have at least one active push subscription.
 * Used by the reminder cron to iterate users.
 */
export async function listSubscribedUsers(): Promise<string[]> {
  const redis = getRedis();
  const keys = await redis.keys("user:*:push-subs");
  return keys.map((k) => k.replace(/^user:/, "").replace(/:push-subs$/, ""));
}
