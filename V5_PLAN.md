# Workout Tracker V5 Plan

**Date:** 2026-04-07
**Current state:** V4 deployed, Terra removed, circuit timer + chat PWA shipped but timer blocked by bug

---

## Codebase Overview

**Stack:** Next.js 14 / React 18 / TypeScript / Tailwind / Zustand / React Query / Vercel / Redis / Clerk / Twilio / Gemini Flash
**URL:** workout-tracker-two-alpha.vercel.app
**Source:** 79 files, ~7,000 LOC (excluding tests), 18 test files with 98 passing / 1 failing
**Bundle:** 73KB main page first load

### File Tree (src/)

```
src/
  app/
    api/
      chat/route.ts              - Gemini Flash AI coach (rate limited, CSRF protected)
      cron/sync-recovery/route.ts - Auto-sync Oura data daily (11:00 UTC cron)
      extract-metrics/route.ts   - Screenshot AI extraction (Gemini Vision)
      health/route.ts            - System health check
      oauth/oura/
        authorize/route.ts       - Oura OAuth redirect
        callback/route.ts        - Oura OAuth token exchange
      oura/
        disconnect/route.ts      - Delete Oura tokens
        status/route.ts          - Check Oura connection
        sync/route.ts            - Pull today's Oura data
      recovery/route.ts          - Phone management + recovery data CRUD
      sync/route.ts              - Cross-device data sync (Redis)
      twilio/
        send-reminder/route.ts   - Daily SMS reminders (13:00 UTC cron)
        webhook/route.ts         - Inbound SMS handler (DONE/STATUS/HELP/Eight Sleep)
    globals.css                  - CSS variables, safe area, dark/light themes
    layout.tsx                   - Root layout with ClerkProvider
    page.tsx                     - Main orchestration (226 lines)
    sign-in/[[...sign-in]]/      - Clerk sign-in
    sign-up/[[...sign-up]]/      - Clerk sign-up
  components/
    chat/ChatSheet.tsx           - Full-screen AI chat (NEW in V4 - PWA optimized)
    dashboard/SessionCard.tsx    - Workout card with timer, confetti, exercise logs
    layout/Header.tsx            - Greeting, recovery/settings buttons
    layout/LandingPage.tsx       - Marketing page for unauthenticated users
    progress/Heatmap.tsx         - 8-week GitHub-style completion grid
    progress/StreakCounter.tsx    - Streak + weekly progress stats
    progress/WeekRhythm.tsx      - 7-day selector with category colors
    recovery/RecoveryBanner.tsx  - Inline recovery status badge
    settings/ConnectedAccounts.tsx - Oura connection card
    settings/SettingsSheet.tsx   - Level, theme, notifications
    settings/SMSConfig.tsx       - Phone number + SMS commands
    tracking/CircuitTimer.tsx    - Circuit workout timer (NEW in V4)
    tracking/ConfettiBurst.tsx   - Completion confetti animation
    tracking/LogModal.tsx        - Workout log with per-exercise tracking
    tracking/RepTimer.tsx        - Super-slow 10s rep timer
    ui/ErrorBoundary.tsx         - React error boundary
    ui/InstallBanner.tsx         - PWA install prompt
    ui/LiveRegion.tsx            - ARIA live region for announcements
    ui/OfflineBanner.tsx         - Offline status indicator
    ui/Sheet.tsx                 - Reusable bottom sheet
    ui/Skeleton.tsx              - Loading skeletons
    ui/SyncIndicator.tsx         - Sync status dot (green/yellow/red)
    Providers.tsx                - QueryClient + ErrorBoundary wrapper
    RecoveryPanel.tsx            - Full recovery data panel (530 lines)
  hooks/
    useConnectedAccounts.ts      - Oura status/sync/disconnect React Query hooks
    useInstallPrompt.ts          - PWA install prompt capture
    useSync.ts                   - Debounced server sync hook
    useTheme.ts                  - Theme management with system detection
    useWorkoutStore.ts           - Zustand store (completions, logs, level, recovery)
  lib/
    crypto.ts                    - AES-256-GCM encryption + SHA-256 hashing
    helpers.ts                   - Date keys, streaks, recovery levels
    oauthTokens.ts               - Encrypted OAuth token storage in Redis
    oura.ts                      - Oura API client
    rateLimit.ts                 - In-memory sliding window rate limiter
    redis.ts                     - Shared ioredis client
    retry.ts                     - Exponential backoff retry utility
    twilioParser.ts              - Eight Sleep SMS + DONE command regex parsing
    validators.ts                - Zod schemas for all API inputs
    workoutData.ts               - 7-day Boundless program definition (517 lines)
  middleware.ts                  - Clerk auth + public route allowlist
  types/workout.ts               - All TypeScript interfaces
```

### Environment Variables (all set on Vercel)

| Variable | Purpose |
|----------|---------|
| KV_REDIS_URL | Redis connection string |
| CLERK_SECRET_KEY | Clerk auth |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk frontend |
| NEXT_PUBLIC_CLERK_SIGN_IN_URL | /sign-in |
| NEXT_PUBLIC_CLERK_SIGN_UP_URL | /sign-up |
| NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL | / |
| NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL | / |
| TWILIO_ACCOUNT_SID | Twilio SMS |
| TWILIO_AUTH_TOKEN | Twilio signature validation |
| TWILIO_PHONE_NUMBER | Outbound SMS number |
| GOOGLE_AI_API_KEY | Gemini Flash (chat + extraction) |
| ANTHROPIC_API_KEY | Legacy (unused since Gemini swap) |
| OURA_CLIENT_ID | Oura OAuth |
| OURA_CLIENT_SECRET | Oura OAuth |
| NEXT_PUBLIC_APP_URL | OAuth redirect base URL |
| PHONE_ENCRYPTION_KEY | AES-256-GCM phone encryption |
| CRON_SECRET | Vercel cron auth bearer token |

### Cron Jobs (vercel.json)

| Path | Schedule | Purpose |
|------|----------|---------|
| /api/cron/sync-recovery | 0 11 * * * (7am EST) | Auto-pull Oura data for all connected users |
| /api/twilio/send-reminder | 0 13 * * * (9am EST) | Send daily workout SMS reminders |

---

## V5 Bug Fixes (Priority Order)

### Bug 1: Circuit Timer + RepTimer hidden on advanced level (HIGH)
**File:** `src/app/page.tsx:197`
**Current:** `showTimer={level !== "advanced"}`
**Problem:** Both the CircuitTimer (cardio) and RepTimer (strength) are invisible when user is on "advanced" level. The `showTimer` prop gates all timers.
**Fix:** Change to `showTimer={true}`. The RepTimer is useful at all levels for super-slow lifting. The CircuitTimer is essential for the 7-minute circuit regardless of level.

### Bug 2: Oura test failing - scope mismatch (MEDIUM)
**File:** `src/__tests__/lib/oura.test.ts:15`
**Current:** Test expects `scope=daily+heartrate+sleep+personal` but code has `scope: "daily heartrate personal"` (no `sleep`)
**Problem:** Either the test is wrong or the scope should include `sleep`. Oura's sleep data is a key part of recovery tracking.
**Fix:** Add `sleep` to the OAuth scope in `src/lib/oura.ts:14` and confirm Oura app permissions include it. The scope should be `"daily heartrate sleep personal"`.

### Bug 3: jsdom ESM compatibility error in component tests (MEDIUM)
**Files:** Component tests using jsdom environment
**Problem:** `html-encoding-sniffer` uses `require()` on an ESM-only `@exodus/bytes` package. Causes 3 unhandled errors in test output.
**Fix:** Pin `jsdom` to a compatible version, or switch component tests to `happy-dom` environment.

### Bug 4: Phone normalization safety net in webhook (LOW)
**File:** `src/app/api/twilio/webhook/route.ts:54-61`
**Problem:** `findUserByPhone(from)` doesn't normalize the incoming phone format before hashing.
**Fix:** Add normalization before hash lookup:
```ts
async function findUserByPhone(phone: string): Promise<string | null> {
  const normalized = phone.replace(/\D/g, "");
  const formatted = normalized.length === 10 ? `+1${normalized}` : `+${normalized}`;
  const redis = getRedis();
  const hashed = hashPhone(formatted);
  // ... rest unchanged
}
```

### Bug 5: Silent decryption failures in send-reminder (LOW)
**File:** `src/app/api/twilio/send-reminder/route.ts:88-89`
**Fix:** Add `console.error()` in the catch block so failed decryptions are visible in Vercel logs.

### Bug 6: Old phone hash not cleaned up (LOW)
**File:** `src/app/api/recovery/route.ts:53-66`
**Fix:** Before storing new phone, read + decrypt + hash old phone and delete the stale `phone-hash:{oldHash}:userId` key.

---

## V5 Feature Enhancements

### 1. Chat UX polish
- The chat is now full-screen (shipped in V4) but could use:
  - Suggested quick prompts ("How should I train today?", "Analyze my recovery", "What's my streak?")
  - Message timestamps
  - Clear chat button

### 2. Timer UX polish
- Circuit timer is built but needs testing on real device after bug #1 fix
- Consider adding round selector (1x, 2x, 3x) for the 7-minute circuit
- Audio beeps may not work on iOS without user gesture to unlock AudioContext

---

## V5 Deploy Checklist

1. [ ] Fix `showTimer` to `true` in page.tsx:197
2. [ ] Add `sleep` to Oura OAuth scope in oura.ts:14
3. [ ] Fix oura test to match new scope
4. [ ] Fix jsdom ESM error (switch to happy-dom or pin version)
5. [ ] Add phone normalization in webhook findUserByPhone
6. [ ] Add console.error for decryption failures
7. [ ] Add old phone hash cleanup on phone change
8. [ ] Run tests - all 99 should pass
9. [ ] Run build - should compile clean
10. [ ] Deploy to Vercel
11. [ ] Test circuit timer on Tuesday's card (PWA)
12. [ ] Send test SMS to verify Twilio end-to-end
13. [ ] Verify Oura sync works with corrected scope

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| V1 | 2026-03 | Initial build - 7-day program, PWA, SMS, recovery panel |
| V2 | 2026-03 | Architecture rewrite - Zustand, React Query, 20+ components, design system, 14 bug fixes |
| V3 | 2026-03-31 | Security hardening, 89 tests, a11y, exercise progression, equipment badges |
| V4 | 2026-04-07 | Gemini swap, Oura OAuth, AI chat, circuit timer, chat PWA, Terra removed |
| V5 | 2026-04-07 | 7 bug fixes, Boundless keyPoints, missing exercises (deadlift), circuit timer on all levels + round selector, happy-dom, 112 tests |
| V6 | Next | UI polish pass, SMS debugging, further Boundless content refinement |
