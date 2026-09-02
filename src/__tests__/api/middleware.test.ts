import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { isPublicRoute } from "@/middleware";

// BUG-12: any route NOT matched by isPublicRoute gets clerkMiddleware's
// auth.protect() run against it. protect()'s unauthenticated-request
// handling only redirects "page" requests (Sec-Fetch-Dest: document/iframe,
// or Accept: text/html); a plain fetch() has neither, so it falls through
// to Next's notFound() - an HTML 404, not JSON. Every route below has its
// own auth() + JSON 401 guard (see src/__tests__/api/*.test.ts), so listing
// them here as public routes lets middleware step aside and let the handler
// produce the JSON 401 a fetch() caller expects.
describe("middleware isPublicRoute (BUG-12)", () => {
  const publicApiPaths = [
    "/api/recovery",
    "/api/recovery/anything",
    "/api/chat",
    "/api/extract-metrics",
    "/api/labs",
    "/api/labs/anything",
    "/api/biomarkers",
    "/api/health-goals",
    // already covered pre-fix, kept public
    "/api/push",
  ];

  it.each(publicApiPaths)("treats %s as public (not gated by auth.protect())", (path) => {
    const req = new NextRequest(`http://localhost:3000${path}`);
    expect(isPublicRoute(req)).toBe(true);
  });

  it("still gates an unrelated protected API route", () => {
    const req = new NextRequest("http://localhost:3000/api/sync");
    expect(isPublicRoute(req)).toBe(false);
  });
});
