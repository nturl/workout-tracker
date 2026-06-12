# Changelog: Boundless Workout Tracker

All notable changes to this project, documented by build session.

V3 through V23 live in session memory (see `~/.claude/.../memory/project_workout_v*_changelog.md`). The in-repo log resumes at V24.

---

## V24 — VO2 Max Timer (2026-05-14)

**Prod:** https://workout-tracker-two-alpha.vercel.app
**Rollback:** V23 = `dpl_EfAhc7C9pZeNgKHZxnq4cB42AALg`

### Why

Live bug: starting "VO2 Max Training" on Thursday produced no timer. Two compounding causes — VO2 had no `exercises` array (only instructions text), and the V23 Tabata regex was hardcoded to seconds, so even with an exercise added it would not have parsed Norwegian 4x4's minute intervals.

### Changes

- **`src/lib/workoutData.ts`** — Tabata regex accepts `s | sec | min` per side independently. New `toSeconds(n, unit)` helper. Same parser path now handles `8 rounds × 20s/10s` (Tabata), `4 rounds × 4 min/4 min` (VO2), and mixed units like `3 rounds × 1 min/30s`.
- **VO2 Max Training gains `exercises` on all 3 levels.** Each level has a single `4 rounds × 4 min/4 min` entry; level-specific cues (no mask, Training Mask shifting, LiveO2 alternation) live in the `notes` field.

### Tests

- 2 new parser tests: VO2 Norwegian 4x4 → workSeconds 240, restSeconds 240, rounds 4. Mixed-unit `3 rounds × 1 min/30s` → 60s/30s.
- 7/7 V23 parser tests pass (5 original + 2 new).
- 3 pre-existing `Tuesday/Tabata` failures remain — unrelated to this work; those tests look for Tabata on Tuesday but it lives on Thursday.

### Why CircuitTimer needed no changes

`formatTime` already renders `m:ss` for ≥60s phases (V6). `CircuitExercise.rounds` already loops work→rest within a single exercise (V23). The whole runtime path was correct — this was purely a data + parser hole.

### Verify on phone

Thursday → expand "VO2 Max Training" card → press play. 6-second 3-2-1 intro, then **4:00 GO!** → **4:00 Rest**, four times (Round 1/4 through 4/4), then "Done" with completion beep.

---

## V2.0 — Architecture Rewrite (Sessions 4-6)

### Architecture: Monolith Decomposition

**Before:** Single 1,273-line `page.tsx` containing all UI, state management, persistence logic, and business rules.

**After:** ~20 focused component files across 6 directories:

| Directory | Files | Purpose |
|-----------|-------|---------|
| `components/dashboard/` | SessionCard | Workout session card with animations |
| `components/layout/` | Header, LandingPage | App chrome and marketing page |
| `components/progress/` | Heatmap, StreakCounter, WeekRhythm | Progress visualization |
| `components/recovery/` | RecoveryBanner | Inline recovery status display |
| `components/settings/` | SettingsSheet, SMSConfig | Settings and SMS configuration |
| `components/tracking/` | ConfettiBurst, LogModal, RepTimer | Workout logging and timer |
| `components/ui/` | ErrorBoundary, Sheet, Skeleton | Shared UI primitives |
| `hooks/` | useWorkoutStore, useSync, useTheme | State and sync hooks |
| `lib/` | helpers, redis, twilioParser, validators | Pure functions and utilities |
| `types/` | workout.ts | All TypeScript type definitions |

The main `page.tsx` is now 196 lines — a thin orchestration layer that wires store, sync, and components together.

---

### State Management: useState to Zustand

**Before:** 18 individual `useState` hooks scattered throughout `page.tsx`, with manual localStorage read/write calls and no centralized state.

**After:** Single Zustand store (`useWorkoutStore`) with `persist` middleware:

- All state in one place: `completions`, `logs`, `level`, `theme`, `recoveryData`, `notifSettings`, `selectedDay`, `mounted`
- Automatic localStorage persistence via `zustand/middleware/persist` with `partialize` to exclude transient state
- Type-safe actions: `toggleCompletion`, `saveLog`, `setLevel`, `setTheme`, `mergeRecoveryData`
- Bulk sync operations: `hydrateFromSync` and `getSyncPayload` for server merge
- Direct state access via `useWorkoutStore.getState()` to avoid stale closures in rapid updates (used in RecoveryPanel's `updateEntry`)

---

### Server Sync: Manual Fetch to React Query

**Before:** Manual `fetch()` calls with no caching, no retry, no deduplication. Data lost on multi-tab or multi-device scenarios.

**After:** `useSync` hook powered by React Query (`@tanstack/react-query` v5):

- `QueryClientProvider` wrapping the app with 30-second stale time and 2 retries
- Initial hydration: React Query fetches `GET /api/sync`, merges server data into Zustand store, pushes merged state back
- Debounced push: 1-second debounced `POST /api/sync` triggered on every completion toggle, log save, or level change
- Optimistic locking on server: Redis `WATCH`/`MULTI` transactions with one automatic retry on conflict
- `refetchOnWindowFocus: true` for instant sync when switching tabs/devices
- Zod validation on all POST bodies (`syncBodySchema`) — invalid payloads return 400

---

### Design System: CSS Variables + Dark/Light Mode

**Added comprehensive design token system in `globals.css`:**

- 13 CSS custom properties for colors, backgrounds, borders, and special elements
- Light mode (`:root`) and dark mode (`.dark`) variants
- `useTheme` hook: reads from Zustand store, applies `.dark` class to `<html>`, listens for `prefers-color-scheme` changes when set to "system"
- Smooth 0.3s transitions on background and color changes

**Mobile-first optimizations:**
- 44px minimum touch targets on all buttons, links, and role="button" elements
- `.inline-touch` escape hatch for inline elements
- `-webkit-tap-highlight-color: transparent` to remove blue flash
- `env(safe-area-inset-*)` padding for iPhone notch and Dynamic Island
- `prefers-reduced-motion` media query (0.01ms animation fallback)
- `.no-scrollbar` utility for horizontal scrolling areas
- `body` padding-bottom with `env(safe-area-inset-bottom)` in layout

---

### Security Hardening

1. **User-scoped Redis keys** — All data keyed by Clerk `userId` (`user:{userId}:data`, `user:{userId}:phone`, `user:{userId}:recovery:{date}`, etc.). No user can access another user's data.

2. **Twilio webhook signature validation** — `validateTwilioRequest()` function verifies `x-twilio-signature` header using `twilio.validateRequest()` against the auth token. Enabled in production only.

3. **Zod input validation** — All API POST bodies validated with Zod schemas before processing:
   - `syncBodySchema` — validates completions (record of booleans), logs (nested with feeling 1-5, duration non-negative, notes max 2000 chars), level (enum), and recovery (nested objects)
   - `recoveryActionSchema` — discriminated union for set-phone (min 10 chars), get-phone, get-completions, test-sms
   - `extractMetricsSchema` — validates image data URL (non-empty) and source (enum)
   - Invalid payloads return 400 with flattened Zod error details

4. **Multi-user phone mapping** — Reverse mapping `phone:{phone}:userId` enables webhook to identify which user sent an SMS. Phone stored as `user:{userId}:phone` instead of global key.

5. **CRON_SECRET validation** — Send-reminder endpoint checks `Bearer {CRON_SECRET}` authorization header.

---

### Recovery Panel Rewrite

**Screenshot Upload with AI Vision Scanning:**
- Upload Eight Sleep or Oura Ring app screenshots
- Client-side image compression: max 800px width, JPEG quality 0.8, 5MB size limit
- Auto-scan on upload via `/api/extract-metrics` endpoint
- Claude Haiku (claude-haiku-4-5-20251001) extracts structured metrics from screenshots
- Auto-fills form fields with extracted values via `onMetricsExtracted` callback
- Re-scan button for re-processing existing images
- Scanning overlay with spinner animation
- Graceful error messages for API credit issues and missing configuration

**14-Day Recovery History Charts:**
- `RecoveryHistory` component renders bar charts for Recovery Score and HRV trends
- Color-coded bars: green (85+/60+ HRV), yellow (70-84/40-59 HRV), red (<70/<40 HRV)
- "14d ago" to "Today" x-axis labels
- Only renders when data exists

**CSV Export:**
- `ExportButton` component generates two CSV files
- `recovery-data.csv`: Date, Recovery Score, HRV, RHR, Deep Sleep %, REM Sleep %, Sleep Score
- `workout-data.csv`: Key, Completed, Feeling, Duration, Notes, Completed At
- Client-side Blob download, no server round-trip

**Date Navigation:**
- 7-day date selector (Today, Yesterday, and 5 previous days)
- Each date shows its own recovery data and status

---

### SMS: Multi-User Phone Mapping

**Before:** Single global phone number stored in `sms:user-phone`. Only one user could receive SMS.

**After:**
- Phone numbers stored per-user: `user:{userId}:phone`
- Reverse mapping created on save: `phone:{phone}:userId`
- Webhook uses `findUserByPhone()` to look up userId from incoming SMS `From` number
- Send-reminder iterates `user:*:phone` keys to send to all registered users
- Recovery data from SMS stored in user-scoped keys when userId is found
- SMS completions stored in user-scoped list: `user:{userId}:sms-completions`
- Legacy `sms:user-phone` key still checked as fallback

**SMS Commands (unchanged):**
- `DONE` / `DONE {day}` / `DONE - {notes}` — mark workout complete
- `STATUS` — weekly SMS completion count
- `HELP` / `?` — command reference
- Eight Sleep text forwarding — auto-parsed via regex

---

### PWA: Service Worker Rewrite

**Before:** Basic service worker with simple cache-or-network strategy. No offline write support.

**After:** Strategy-based service worker (`sw.js`) with IndexedDB sync queue:

**Three named caches:**
- `workout-static-v2` — cache-first for static assets (JS, CSS, PNG, JPG, SVG, ICO, WOFF2)
- `workout-api-v2` — network-first with cache fallback for API GET requests
- `workout-tracker-v2` — general cache

**Cache strategies by request type:**
1. **Navigation** — network first, fallback to cached `/`
2. **POST /api/sync** — try network; on failure, queue in IndexedDB and return `{ queued: true }`
3. **API GET** — network first, cache successful responses, fallback to cache
4. **Static assets** — cache first, fetch and cache on miss
5. **Everything else** — network first, fallback to cache

**Offline sync queue (IndexedDB):**
- Database: `workout-sync`, object store: `queue` with auto-increment ID
- `addToQueue()` — stores URL, method, body, and timestamp
- `drainQueue()` — replays queued requests; deletes on success or 4xx; retries on 5xx; stops on network error
- Triggered by Background Sync API (`sync` event with tag `workout-sync`)
- Also triggered via `message` event (`drain-queue`) for manual flush

**Lifecycle:**
- `install` — precaches `/` and `/manifest.json`, calls `skipWaiting()`
- `activate` — deletes old caches not in valid list, calls `clients.claim()`

---

### Testing: Vitest Setup

**Added Vitest with 40 passing tests across 3 test suites:**

**`helpers.test.ts` (16 tests):**
- `weekKey` — returns Sunday of the week, handles Sunday input
- `sessionSlug` — slugifies titles, handles special characters
- `sessionKey` — combines week, day, and slug
- `calculateStreak` — empty completions (0), today fully completed (1)
- `getBestStreak` — empty completions (0)
- `getWeekProgress` — correct totals for empty, counts completed sessions
- `getRecoveryLevel` — Well Recovered (high score), Moderate, Low Recovery, No Data, HRV-based threshold
- `getGreeting` — returns valid greeting string

**`twilioParser.test.ts` (10 tests):**
- `parseEightSleepSMS` — full message parsing (score, HRV, RHR, deep/REM %), partial data, rejects non-Eight Sleep messages
- `parseWorkoutDone` — simple DONE, DONE with day name, DONE with notes, DONE with day and notes, case insensitivity, rejects non-DONE messages

**`validators.test.ts` (14 tests):**
- `syncBodySchema` — valid sync data, empty object, invalid level, invalid feeling
- `recoveryActionSchema` — set-phone valid, short phone rejected, get-phone, get-completions, test-sms, unknown action rejected
- `logEntrySchema` — valid entry, empty entry, notes over 2000 chars rejected, negative duration rejected, feeling outside 1-5 rejected

---

### Bug Fixes (14 bugs found and fixed)

1. **Mobile screenshot upload crash** — `FileReader` result type assertion failed on iOS Safari; fixed by adding explicit type guard on `ev.target?.result`

2. **Data persistence race condition** — Multiple rapid completion toggles could overwrite each other; fixed with Redis `WATCH`/`MULTI` optimistic locking and one automatic retry

3. **Timezone offset in date keys** — `weekKey()` used UTC methods, causing days to shift near midnight; fixed by using local Date methods consistently

4. **Stale closure in RecoveryPanel** — `updateEntry` captured stale `recoveryData` from closure when multiple fields updated in quick succession; fixed by reading latest state via `useWorkoutStore.getState()` inside the callback

5. **Log key index-based collision** — Adding Egoscue/Meditation sessions shifted indices, causing old logs to appear under wrong workout cards; fixed by changing key format from `week:day:index` to `week:day:slug` (title-based)

6. **Redis client instantiation per request** — Each API call created a new ioredis connection; fixed by caching the client in module-level variable with `lazyConnect: true`

7. **`@vercel/kv` REST API mismatch** — `@vercel/kv` required `KV_REST_API_URL`/`KV_REST_API_TOKEN` but only `KV_REDIS_URL` was configured, causing all API routes to return 500; fixed by replacing `@vercel/kv` with `ioredis` throughout the entire codebase

8. **Body scroll leak on Sheet close** — Opening and closing Sheet component leaked `overflow: hidden` on body; fixed with cleanup function in `useEffect`

9. **Heatmap ring offset in dark mode** — Today's cell ring used hardcoded white offset color; fixed with `--ring-offset` CSS variable

10. **SMS completions unbounded growth** — SMS completion list grew without limit; fixed by capping at 30 entries with `splice(0, length - 30)`

11. **Twilio webhook accepting unsigned requests** — Anyone could POST fake SMS; fixed by adding `validateTwilioRequest()` with signature verification in production

12. **ErrorBoundary missing** — Render errors showed blank white screen; fixed by adding `ErrorBoundary` component wrapping the app in `Providers`

13. **Service worker cache leak** — Old cache versions persisted indefinitely; fixed by tracking valid cache names and deleting stale ones on `activate`

14. **Send-reminder single-user limitation** — Cron job only sent to one global phone number; fixed by iterating `user:*:phone` keys to send to all registered users

---

### New Components (V2)

| Component | Lines | Purpose |
|-----------|-------|---------|
| `SessionCard` | 141 | Animated workout card with confetti, timer, expandable details |
| `Header` | 37 | Greeting, recovery/settings buttons, Clerk UserButton |
| `LandingPage` | 128 | Marketing page with features, schedule preview, CTAs |
| `ConsistencyHeatmap` | 59 | 8-week GitHub-style completion grid |
| `StreakCounter` | 29 | Streak, weekly progress, best streak stats |
| `WeekRhythm` | 41 | 7-day selector with dates and category colors |
| `RecoveryBanner` | 29 | Inline recovery status with score/HRV badges |
| `SettingsSheet` | 137 | Level, theme, notifications, SMS config |
| `SMSConfig` | 109 | Phone input, save, test SMS, command reference |
| `ConfettiBurst` | 43 | Framer Motion confetti animation |
| `LogModal` | 77 | Workout log entry with feeling, duration, notes |
| `RepTimer` | 52 | 10-second super-slow rep timer |
| `ErrorBoundary` | 53 | React error boundary with retry UI |
| `Sheet` | 67 | Reusable bottom sheet with Framer Motion |
| `Skeleton` | 52 | Loading skeleton for dashboard |
| `Providers` | 27 | QueryClient + ErrorBoundary wrapper |

### New Hooks (V2)

| Hook | Purpose |
|------|---------|
| `useWorkoutStore` | Zustand store with persist middleware |
| `useSync` | React Query sync with debounced push |
| `useTheme` | Theme management with system detection |

### New Libraries Added (V2)

| Package | Version | Purpose |
|---------|---------|---------|
| `zustand` | 5.0.12 | Centralized state management with persist |
| `@tanstack/react-query` | 5.95.2 | Server sync with caching and deduplication |
| `zod` | 4.3.6 | Runtime schema validation for API inputs |
| `framer-motion` | 12.38.0 | Animations (cards, sheets, confetti) |
| `vitest` | 3.2.4 | Unit testing framework |
| `@testing-library/react` | 16.3.2 | React component testing utilities |
| `@testing-library/jest-dom` | 6.9.1 | DOM assertion matchers |
| `jsdom` | 29.0.1 | Browser environment for tests |

### New API Endpoints (V2)

| Endpoint | Purpose |
|----------|---------|
| `/api/health` | System health check (Redis, Twilio, Clerk, Anthropic config status) |

### New Files (V2)

| File | Purpose |
|------|---------|
| `src/hooks/useWorkoutStore.ts` | Zustand store |
| `src/hooks/useSync.ts` | React Query sync hook |
| `src/hooks/useTheme.ts` | Theme hook |
| `src/lib/helpers.ts` | Pure utility functions extracted from page.tsx |
| `src/lib/validators.ts` | Zod schemas |
| `src/types/workout.ts` | All TypeScript types |
| `src/components/Providers.tsx` | QueryClient + ErrorBoundary |
| `src/components/dashboard/SessionCard.tsx` | Session card component |
| `src/components/layout/Header.tsx` | Header component |
| `src/components/layout/LandingPage.tsx` | Landing page |
| `src/components/progress/Heatmap.tsx` | Consistency heatmap |
| `src/components/progress/StreakCounter.tsx` | Streak display |
| `src/components/progress/WeekRhythm.tsx` | Day selector |
| `src/components/recovery/RecoveryBanner.tsx` | Recovery inline banner |
| `src/components/settings/SettingsSheet.tsx` | Settings sheet |
| `src/components/settings/SMSConfig.tsx` | SMS config panel |
| `src/components/tracking/ConfettiBurst.tsx` | Confetti animation |
| `src/components/tracking/LogModal.tsx` | Log entry modal |
| `src/components/tracking/RepTimer.tsx` | Rep timer |
| `src/components/ui/ErrorBoundary.tsx` | Error boundary |
| `src/components/ui/Sheet.tsx` | Bottom sheet |
| `src/components/ui/Skeleton.tsx` | Loading skeletons |
| `src/app/api/health/route.ts` | Health check endpoint |
| `src/__tests__/helpers.test.ts` | Helper function tests |
| `src/__tests__/twilioParser.test.ts` | Twilio parser tests |
| `src/__tests__/validators.test.ts` | Validator tests |
| `vitest.config.ts` | Vitest configuration |

---

## Session 3 — Cross-Device Sync, Redis Fix, AI Screenshot Scanning

### Cross-Device Sync
- Created `/api/sync` route (GET + POST) for server-side data persistence
- User data stored in Redis keyed by Clerk userId: `user:{userId}:data`
- Client-side sync flow: load localStorage -> fetch server -> merge (server wins) -> push back
- Debounced sync (1-second) on every completion toggle, log save, or level change
- Landing page gate: unauthenticated users see marketing page, authenticated see dashboard

### Redis Migration (Bug Fix -- Critical)
- **Root cause:** `@vercel/kv` requires `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars, but only `KV_REDIS_URL` (Redis protocol URL) was configured
- All `/api/sync`, `/api/recovery`, and Twilio routes were returning 500 errors
- **Fix:** Replaced `@vercel/kv` with `ioredis` package throughout entire codebase
- Created `src/lib/redis.ts` -- shared Redis client with connection reuse across serverless invocations
- Updated all 4 API route files to use `getRedis()` instead of `kv` import
- Added JSON serialization/deserialization (ioredis doesn't auto-serialize like @vercel/kv)

### AI-Powered Screenshot Metric Extraction
- Created `/api/extract-metrics` route using Anthropic Claude API (Haiku model)
- Accepts base64 image data URL + source type (eightSleep or oura)
- Returns structured JSON with extracted metrics (scores, HRV, RHR, sleep percentages, etc.)
- Updated `ScreenshotUpload` component with scanning overlay UI and auto-scan on upload
- Requires `ANTHROPIC_API_KEY` env var

### Landing Page
- Built hero section with app title, description, and weekly schedule preview
- Feature cards highlighting key capabilities
- Sign-in/Sign-up CTAs using Clerk components
- Shown only to unauthenticated users

### Dependencies Added
- `ioredis` -- Redis client for KV_REDIS_URL
- `@anthropic-ai/sdk` -- Claude API for screenshot extraction

---

## Session 2 — Recovery, SMS, Egoscue, Auth

### Recovery Panel -- Oura Ring Metrics Update
- Updated Oura metrics to match real Oura app: Total Sleep, Efficiency, Restfulness, REM Sleep, Deep Sleep, Latency, Timing
- Added new input components: TextMetricInput (string values like "8h 21m") and SelectMetricInput (dropdowns like "Optimal"/"Good"/"Pay attention")
- Restructured Oura section into three subsections: Scores, Contributors, Key Metrics
- Recovery-level calculation: green (85+), yellow (70-84), red (<70)
- Recovery banner on daily view showing status and intensity recommendation

### Eight Sleep Integration
- Manual Eight Sleep data input panel
- Screenshot upload support for sleep data

### Twilio SMS Integration
- **Inbound webhook** (`/api/twilio/webhook`) handling:
  - Eight Sleep text auto-parsing with regex (sleep score, time slept, deep/REM %, RHR, HRV)
  - "DONE" command parsing (with optional day name and notes)
  - "HELP" and "STATUS" commands
  - TwiML XML responses
- **Outbound reminders** (`/api/twilio/send-reminder`):
  - Daily cron at 8 AM EST via Vercel cron jobs
  - Recovery-aware messaging (green/yellow/red based on sleep score)
  - Day-specific workout info with tips
- **Recovery API** (`/api/recovery`):
  - GET recovery data by date
  - POST actions: set-phone, get-phone, get-completions, test-sms
- SMS Settings panel in app with phone number input and test button
- Twilio phone number configured: (877) 319-3797
- Toll-free verification submitted (pending approval)

### Vercel KV (Redis) Database
- Set up Vercel KV store (redis-violet-lens, 30MB free tier)
- Connected to project with KV_ env var prefix
- Used for: recovery data, SMS completions, user phone storage

### Egoscue Postural Therapy
- Added "posture" category with cyan color scheme
- Created `egoscueSession` constant with full exercise routines:
  - **Beginner** (15-20 min): Static Back, Static Wall, Standing Arm Circles, Standing Elbow Curls, Gravity Drop
  - **Intermediate** (25-35 min): + Supine Groin Progressive, Air Bench, Cats and Dogs
  - **Advanced** (35-50 min): + Hip Crossover Stretch, Wall Stork, Runner's Stretch
- Added as first session every day (Mon-Sun)

### Meditation
- Added "meditation" category with indigo-violet color scheme
- Created `meditationSession` constant:
  - **Beginner** (5-10 min): Box breathing + breath observation
  - **Intermediate** (15-20 min): Breathwork + seated meditation + gratitude
  - **Advanced** (25-35 min): Wim Hof/Tummo + vipassana/zazen + optional neurofeedback
- Added as second session every day (after Egoscue, before day's main workout)

### Log Key Migration (Bug Fix)
- Fixed bug where adding Egoscue/Meditation shifted session indices, causing old logs to appear under wrong workout cards
- Changed key format from `week:day:index` to `week:day:slug` (title-based)
- Added automatic migration of old index-based keys to title-based keys on first load
- Keys are now stable regardless of session ordering changes

### Clerk Authentication
- Installed `@clerk/nextjs` v7 for multi-user support
- Created Clerk app on Clerk dashboard
- Added middleware protecting all routes except sign-in/sign-up and Twilio webhooks
- Created embedded sign-in and sign-up pages with Clerk components
- Wrapped app in `ClerkProvider` in root layout
- Added `UserButton` component in header for profile/sign-out
- Personalized greeting with user's first name
- **User-scoped localStorage**: all data keys prefixed with `u:{userId}:`
- Auto-migration of pre-auth localStorage data to user-scoped keys on first sign-in
- Added `.npmrc` with `legacy-peer-deps=true` for Clerk/React 18 compatibility

---

## Session 1 — Initial Build

### Core App
- Built Next.js 14 app with React 18 and Tailwind CSS 3
- Implemented full 7-day Boundless fitness blueprint weekly schedule
- Created workout data model with three difficulty tiers (beginner/intermediate/advanced)
- 6 workout categories: strength, cardio, recovery, flexibility, adventure, social, brain
- Session cards with expandable details, completion toggles, and workout logging
- Log modal with feeling rating (1-5 emoji scale), duration, and notes
- Dark mode UI with gradient-coded category badges

### Progress Tracking
- Day streak counter (consecutive all-sessions-complete days)
- Best streak (all-time record)
- Weekly progress bar (X/total sessions, percentage)
- 8-week consistency heatmap (GitHub-style completion grid)
- Weekly rhythm section showing all 7 day themes at a glance

### Settings
- Difficulty level selector (beginner/intermediate/advanced)
- Theme toggle (light/dark/system)
- Notification scheduling per day of week

### PWA
- Service worker for offline support
- App manifest with icons
- Apple Web App capable configuration
- Installable on mobile home screens

### Deployment
- Deployed to Vercel at `workout-tracker-two-alpha.vercel.app`
