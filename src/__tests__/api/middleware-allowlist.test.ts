import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { isAllowedUser, denyIfNotAllowed } from "@/lib/allowlist";

// Run the real middleware handler: clerkMiddleware is swapped for a thin
// wrapper that hands the handler a fake auth(), createRouteMatcher stays real.
let signedInAs: string | null = null;
const protect = vi.fn();
vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return {
    ...actual,
    clerkMiddleware: (handler: (auth: unknown, req: NextRequest) => unknown) => (req: NextRequest) => {
      const auth = Object.assign(async () => ({ userId: signedInAs }), { protect });
      return handler(auth, req);
    },
  };
});

const { default: middleware } = await import("@/middleware");
const run = (path: string) =>
  (middleware as unknown as (req: NextRequest) => Promise<Response | undefined>)(
    new NextRequest(`http://localhost:3000${path}`),
  );

describe("isAllowedUser", () => {
  it("allows only listed ids, trimming spaces", () => {
    expect(isAllowedUser("user_noel", "user_noel")).toBe(true);
    expect(isAllowedUser("user_noel", " user_a , user_noel ")).toBe(true);
    expect(isAllowedUser("user_stranger", "user_noel")).toBe(false);
  });
  it("fails closed when the list is unset or empty", () => {
    expect(isAllowedUser("user_noel", undefined)).toBe(false);
    expect(isAllowedUser("user_noel", "")).toBe(false);
    expect(isAllowedUser("", ",")).toBe(false);
  });
  it("lets signed-out requests through to the existing auth checks", () => {
    expect(denyIfNotAllowed(null, new NextRequest("http://localhost/api/chat"), "user_noel")).toBeNull();
  });
});

describe("middleware allowlist (open Clerk sign-up)", () => {
  const before = process.env.ALLOWED_USER_IDS;
  beforeEach(() => {
    process.env.ALLOWED_USER_IDS = "user_noel";
    protect.mockClear();
  });
  afterEach(() => {
    if (before === undefined) delete process.env.ALLOWED_USER_IDS;
    else process.env.ALLOWED_USER_IDS = before;
  });

  it.each(["/api/chat", "/api/extract-metrics", "/api/extract-labs", "/api/health-insights", "/api/health-goals", "/api/recovery"])(
    "a stranger's account gets a JSON 403 on %s (no Anthropic or Twilio call)",
    async (path) => {
      signedInAs = "user_stranger";
      const res = await run(path);
      expect(res?.status).toBe(403);
      expect(await res?.json()).toEqual({ error: "Forbidden" });
    },
  );

  it("a stranger's account gets a 403 on app pages", async () => {
    signedInAs = "user_stranger";
    const res = await run("/");
    expect(res?.status).toBe(403);
  });

  it("the allowlisted user passes through", async () => {
    signedInAs = "user_noel";
    expect(await run("/api/chat")).toBeUndefined();
    expect(await run("/api/sync")).toBeUndefined();
    expect(protect).toHaveBeenCalledTimes(1); // /api/sync is still auth.protect()ed
  });

  it("a stranger can still load sign-in and sign-up (to sign out)", async () => {
    signedInAs = "user_stranger";
    expect(await run("/sign-in")).toBeUndefined();
    expect(await run("/sign-up")).toBeUndefined();
  });

  it("signed-out cron and webhook calls are untouched", async () => {
    signedInAs = null;
    expect(await run("/api/cron/send-reminder")).toBeUndefined();
    expect(await run("/api/twilio/webhook")).toBeUndefined();
  });

  it("with ALLOWED_USER_IDS unset, every signed-in user is refused", async () => {
    delete process.env.ALLOWED_USER_IDS;
    signedInAs = "user_noel";
    expect((await run("/api/chat"))?.status).toBe(403);
  });
});
