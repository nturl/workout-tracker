import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { denyIfNotAllowed } from "@/lib/allowlist";

// Routes below handle auth internally via auth() + a JSON 401, instead of
// relying on clerkMiddleware's auth.protect(). This matters for any
// fetch()-initiated call (as opposed to a full page navigation): protect()'s
// unauthenticated-request handling looks at the Sec-Fetch-Dest/Accept
// headers, and a plain fetch() has neither "document"/"iframe" dest nor
// "text/html" in Accept, so it falls through to Next's notFound() - an HTML
// 404 page, not JSON. Client code that does res.json() on the response then
// throws a JSON-parse error instead of seeing a clean 401 (e.g. after the
// session expires in a tab that's still open). Every route listed here has
// its own auth() + 401 guard, verified per-route in src/__tests__/api/.
export const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/twilio/webhook(.*)",
  "/api/cron/(.*)",
  "/api/health(.*)",
  "/api/oauth/oura/callback(.*)",
  "/api/push(.*)",
  "/api/recovery(.*)",
  "/api/chat(.*)",
  "/api/extract-metrics(.*)",
  "/api/labs(.*)",
  "/api/biomarkers(.*)",
  "/api/health-goals(.*)",
  "/manifest.json",
]);

// Sign-in and sign-up stay reachable so a blocked user can still see Clerk's
// pages (and sign out); everything else is allowlist-only once signed in.
const isAuthPage = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isAuthPage(req)) {
    const { userId } = await auth();
    const denied = denyIfNotAllowed(userId, req);
    if (denied) return denied;
  }
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
