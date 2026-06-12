import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(
  req: NextRequest,
  opts: { limit: number; windowMs: number }
): { success: boolean; remaining: number } {
  cleanup();

  const ip = getClientIP(req);
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + opts.windowMs });
    return { success: true, remaining: opts.limit - 1 };
  }

  entry.count++;
  if (entry.count > opts.limit) {
    return { success: false, remaining: 0 };
  }

  return { success: true, remaining: opts.limit - entry.count };
}

export function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}

export function checkCsrf(req: NextRequest): boolean {
  return req.headers.get("x-requested-with") === "fetch";
}

export function csrfResponse(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
