import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/twilio/webhook(.*)",
  "/api/cron/(.*)",
  "/api/health(.*)",
  "/api/oauth/oura/callback(.*)",
  // Push routes handle auth internally via auth() + 401. Letting Clerk
  // middleware intercept turns unauthed fetches into 404 redirects, which
  // breaks SW-initiated calls after session expiry.
  "/api/push(.*)",
  "/manifest.json",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
