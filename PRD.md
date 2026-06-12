# Product Requirements Document: Boundless Workout Tracker V2

## Overview

A mobile-first progressive web application for tracking daily workouts based on the **Boundless fitness blueprint** (Ben Greenfield). The app provides a structured 7-day training program with three difficulty tiers, sleep/recovery integration via Eight Sleep and Oura Ring, SMS-based logging through Twilio, AI-powered screenshot scanning, and multi-user authentication with cross-device sync.

**Live URL:** https://workout-tracker-two-alpha.vercel.app

---

## Problem Statement

Following a structured weekly fitness program requires tracking multiple workout types across seven days, adjusting intensity based on recovery metrics, and maintaining consistency over time. Existing fitness apps are either too generic or require manual logging that breaks the habit loop.

## Solution

A purpose-built tracker that:
- Presents each day's workout plan with beginner/intermediate/advanced tiers
- Integrates sleep and recovery data (Eight Sleep, Oura Ring) to adjust training intensity
- Supports SMS-based logging ("reply DONE to log")
- Sends daily personalized workout reminders based on recovery status
- Tracks streaks, weekly progress, and long-term consistency via heatmap
- Scans screenshots of sleep apps with AI vision to auto-fill recovery metrics
- Syncs data across devices via Redis with offline queue support

---

## Target Users

- Individuals following the Boundless fitness blueprint
- Fitness enthusiasts wanting a structured weekly program with recovery-aware training
- Users who prefer SMS-based logging over opening an app

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 14 |
| UI | React | 18 |
| Styling | Tailwind CSS | 3 |
| Auth | Clerk (`@clerk/nextjs`) | 7 |
| State Management | Zustand (with persist middleware) | 5 |
| Server Sync | React Query (`@tanstack/react-query`) | 5 |
| Validation | Zod | 4 |
| Animation | Framer Motion | 12 |
| SMS | Twilio (`twilio`) | 5 |
| Database | ioredis (Redis) | 5 |
| AI Vision | Anthropic SDK (`@anthropic-ai/sdk`) | 0.80 |
| Testing | Vitest | 3 |
| Hosting | Vercel | - |

---

## Features

### 1. Weekly Workout Schedule

**7-day Boundless program:**

| Day | Theme | Focus |
|-----|-------|-------|
| Monday | Build | Super-Slow Strength (progressive overload) |
| Tuesday | Burn | Functional Fitness + VO2 Max intervals |
| Wednesday | Restore | Detox session + Brain Training |
| Thursday | Heat | Sauna, cold exposure, massage |
| Friday | Build | Super-Slow Strength (repeat Monday) |
| Saturday | Explore | Outdoor adventure |
| Sunday | Connect | Social sport + Brain Training |

**Every day begins with:**
1. Egoscue E-cises (postural alignment therapy) - 15-50 min
2. Meditation (breathwork & mindfulness) - 5-35 min

**Three difficulty levels:**
- **Beginner** - foundational movements, shorter durations
- **Intermediate** - added techniques (BFR bands, breathwork variations, clay masks)
- **Advanced** - full program with specialized equipment (LiveO2, neurofeedback, Egoscue Tower)

### 2. Workout Categories (9 types)

| Category | Color Scheme | Icon |
|----------|-------------|------|
| Strength | Blue/Indigo gradient | weight_lifting |
| Cardio | Orange/Red gradient | zap |
| Recovery | Emerald/Teal gradient | person_in_lotus_position |
| Flexibility | Purple/Pink gradient | - |
| Posture | Cyan/Blue gradient | person_standing |
| Meditation | Indigo/Violet gradient | person_in_lotus_position |
| Adventure | Amber/Orange gradient | mountain |
| Social | Teal/Cyan gradient | handshake |
| Brain | Violet/Purple gradient | brain |

Each category has a full color definition in `categoryColors` with `gradient`, `bg`, `text`, and `badge` variants for light and dark mode consistency.

### 3. Session Logging

- **Tap to complete** - animated checkmark toggle on each session card with confetti burst and haptic feedback (`navigator.vibrate`)
- **Detailed log modal** - bottom sheet with feeling (1-5 emoji scale: Exhausted/Tough/Good/Strong/On Fire), duration (minutes), and free-text notes
- **SMS logging** - text "DONE" (or "DONE Monday", "DONE - felt great") to the Twilio number

### 4. Recovery Integration

**Eight Sleep:**
- Auto-parse forwarded Eight Sleep text messages via Twilio webhook
- Upload screenshots for AI-powered metric extraction (Claude Haiku vision)
- Manual input via Recovery Panel
- Metrics: Sleep Fitness Score, Time Slept, Deep Sleep %, REM Sleep %, RHR, HRV
- Stored server-side in Redis (user-scoped keys)

**Oura Ring:**
- Upload screenshots for AI-powered metric extraction (Claude Haiku vision)
- Manual input via Recovery Panel
- Scores: Readiness Score, Sleep Score
- Contributors: Total Sleep, Efficiency, Restfulness (select), REM Sleep, REM %, Deep Sleep, Deep %, Latency, Timing (select)
- Key Metrics: HRV, RHR, Body Temp

**Recovery Levels (computed in `getRecoveryLevel`):**
- **Well Recovered** (85+ score or 60+ HRV) - "You're primed -- go hard today."
- **Moderate Recovery** (70-84 score or 40-59 HRV) - "Follow the program as written."
- **Low Recovery** (<70 score or <40 HRV) - "Consider dialing back intensity."
- **No Data** - "Log your recovery data to get personalized recommendations."

**Recovery History:**
- 14-day bar charts for Recovery Score and HRV trends
- Color-coded bars (green/yellow/red thresholds)
- Displayed within the Recovery Panel

### 5. AI Screenshot Scanning

- Upload Eight Sleep or Oura Ring app screenshots
- Images are compressed client-side (max 800px width, JPEG 0.8 quality, 5MB limit)
- Sent to `/api/extract-metrics` which uses Claude Haiku (claude-haiku-4-5-20251001) vision
- Returns structured JSON with extracted metrics
- Auto-fills recovery form fields on successful scan
- Scanning overlay with spinner UI during processing
- Re-scan and Replace buttons for uploaded images
- Graceful error handling for API credit issues and missing configuration

### 6. SMS Integration (Twilio)

**Inbound commands (webhook at `/api/twilio/webhook`):**
- `DONE` - Mark today's workout complete
- `DONE Monday` - Mark specific day complete
- `DONE - notes here` - Complete with notes
- `STATUS` - Get weekly summary (SMS completions count)
- `HELP` or `?` - List commands
- Eight Sleep text forwarding - auto-parsed and stored

**Outbound reminders (`/api/twilio/send-reminder`):**
- Daily at 8 AM EST (Vercel cron at 13:00 UTC)
- Multi-user support - iterates all `user:*:phone` keys in Redis
- Personalized by day's workout theme, tip, and recovery status
- Falls back to legacy single-phone key if no user-scoped keys exist

**Multi-user phone mapping:**
- Phone numbers stored as `user:{userId}:phone`
- Reverse mapping `phone:{phone}:userId` for webhook user identification
- Legacy `sms:user-phone` key supported for backward compatibility

**Security:**
- Twilio webhook signature validation using `twilio.validateRequest()` in production
- CRON_SECRET bearer token required for send-reminder endpoint

### 7. Progress Tracking

- **Day streak** - consecutive days with all sessions complete (scans up to 365 days)
- **Best streak** - all-time record (scans 365 days in reverse)
- **Weekly progress** - X/total sessions with percentage bar (animated width transition)
- **Consistency heatmap** - 8-week GitHub-style grid with completion intensity (0%/25%/50%/75%/100%) using CSS `rgba` with custom `--heatmap-fill` variable
- **Weekly rhythm** - 7-day pill selector showing date, day abbreviation, and category color dot; today highlighted

### 8. Authentication (Clerk)

- Google OAuth and email/password sign-in via `@clerk/nextjs` v7
- `ClerkProvider` wraps entire app at root layout level
- `clerkMiddleware` with `createRouteMatcher` protects all routes except:
  - `/` (landing page)
  - `/sign-in(.*)`, `/sign-up(.*)`
  - `/api/twilio/webhook(.*)`, `/api/twilio/send-reminder(.*)`
- Embedded sign-in/sign-up pages using Clerk components
- `UserButton` component in header for profile/sign-out
- Personalized greeting with user's first name ("Good morning, Noel")
- Auth gate: unauthenticated users see LandingPage component; authenticated users see dashboard

### 9. PWA Support

- **Service worker** (`public/sw.js`) with three cache strategies:
  - `workout-static-v2`: cache-first for static assets (JS, CSS, images, fonts)
  - `workout-api-v2`: network-first with cache fallback for API GET requests
  - Navigation: network-first, fallback to cached `/`
- **Offline sync queue** via IndexedDB:
  - POST to `/api/sync` queued in IndexedDB when offline
  - Queue drained on reconnect via Background Sync API (`sync` event with tag `workout-sync`)
  - Manual drain via `message` event (`drain-queue`)
  - Only retries on 5xx errors; 4xx responses delete the queued item
- **App manifest** (`public/manifest.json`):
  - Standalone display, portrait orientation
  - 192x192 and 512x512 icons (any + maskable)
  - Shortcut: "Today's Workout" -> `/`
  - Categories: fitness, health
- **Apple Web App**: `capable: true`, `statusBarStyle: "black-translucent"`
- **Safe area insets**: CSS `env(safe-area-inset-*)` for iPhone notch/Dynamic Island

### 10. Cross-Device Sync

- `/api/sync` GET/POST endpoints with Redis persistence
- Data keyed by Clerk userId: `user:{userId}:data`
- Sync flow: local Zustand store -> 1-second debounced POST -> Redis merge -> React Query invalidation
- Hydration: on first load, fetches server data and merges into local store (server wins), then pushes merged state back
- Optimistic locking: `WATCH`/`MULTI` Redis transactions on POST with one retry on conflict
- React Query configuration: 30-second stale time, refetch on window focus, 2 retries

### 11. State Management (Zustand)

**Store (`useWorkoutStore`) persisted to localStorage via `zustand/middleware/persist`:**
- `completions: CompletionRecord` - session completion toggles (keyed by `week:day:slug`)
- `logs: WorkoutLogRecord` - detailed workout logs (notes, duration, feeling, completedAt)
- `level: Level` - selected difficulty tier (beginner/intermediate/advanced)
- `theme: Theme` - light/dark/system preference
- `recoveryData: RecoveryData` - all recovery entries by date
- `notifSettings: NotificationSettings` - reminder schedule per day
- `selectedDay: string` - currently selected day in week rhythm
- `mounted: boolean` - hydration flag

**Actions:**
- `toggleCompletion`, `saveLog`, `setLevel`, `setTheme`
- `setRecoveryData`, `mergeRecoveryData`
- `hydrateFromSync`, `getSyncPayload` (bulk operations for sync)

### 12. Design System

**CSS Variables:** Full light/dark mode token system in `globals.css`:
- `--bg-primary`, `--bg-card`, `--bg-elevated`, `--bg-input`
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--border`, `--border-active`, `--ring-offset`
- `--heatmap-empty`, `--heatmap-fill`
- `--timer-bg`, `--modal-overlay`

**Theme switching:** `useTheme` hook applies `.dark` class to `<html>` based on store state; listens for `prefers-color-scheme` changes when set to "system".

**Mobile optimizations:**
- 44px minimum touch targets on all interactive elements (`button`, `a`, `[role="button"]`)
- `.inline-touch` class to override minimum for inline elements
- `-webkit-tap-highlight-color: transparent`
- `prefers-reduced-motion` media query respects accessibility preferences
- Hidden scrollbar utility (`.no-scrollbar`)
- Smooth scrolling on `html`

### 13. Super-Slow Rep Timer

- Built-in 10-second interval timer for super-slow strength exercises
- Alternates between LIFTING (up arrow, blue) and LOWERING (down arrow, amber) phases
- Play/pause and reset controls
- Displayed inside SessionCard when expanded, for strength sessions at beginner/intermediate levels

### 14. Confetti Burst Animation

- Framer Motion animated confetti particles on workout completion
- 20 particles in 6 colors radiating outward from center
- 0.6-second animation with staggered delays

### 15. Landing Page

- Dark-themed hero section with gradient text
- Weekly schedule preview grid (7 days with emoji and gradient colors)
- 6 feature cards: 7-Day Program, 3 Difficulty Levels, Recovery Tracking, SMS Logging, Streak Tracking, Egoscue + Meditation
- Sign-in/Sign-up CTAs using Clerk `SignInButton` and `SignUpButton` components
- Bottom CTA section with gradient border

### 16. Settings

- **Level selector** - 3 buttons (Beginner/Intermediate/Advanced) with icons
- **Theme toggle** - Light/Dark/System with smooth switching
- **Notification reminders** - toggle with per-day time picker showing workout name
- **SMS configuration** - phone number input, save, test SMS button, command reference

### 17. Error Boundary

- React class component `ErrorBoundary` wrapping the app via `Providers`
- Fallback UI with error message and "Try Again" button
- Catches render errors to prevent blank screen crashes

### 18. Loading Skeleton

- `DashboardSkeleton` component shown during auth/hydration
- Matches dashboard layout structure with animated pulse placeholders
- Prevents layout shift on load

### 19. Sheet (Bottom Sheet) Component

- Reusable modal component using Framer Motion
- Slides up from bottom on mobile, centered on desktop
- Backdrop blur overlay
- Sticky header with title, subtitle, and close button
- Max height 92vh with scroll
- Body scroll lock when open

### 20. CSV Export

- Export button in Recovery Panel
- Generates two CSV files:
  - `recovery-data.csv`: Date, Recovery Score, HRV, RHR, Deep Sleep %, REM Sleep %, Sleep Score
  - `workout-data.csv`: Key, Completed, Feeling, Duration, Notes, Completed At
- Client-side Blob download

---

## Architecture Overview

### Component Tree

```
RootLayout (ClerkProvider, Providers)
  |
  +-- Home (page.tsx)
       |
       +-- LandingPage (unauthenticated)
       |
       +-- DashboardSkeleton (loading)
       |
       +-- Dashboard (authenticated + mounted)
            |-- Header (greeting, recovery button, settings button, UserButton)
            |-- StreakCounter (streak, this week, best streak)
            |-- WeekRhythm (7-day selector)
            |-- RecoveryBanner (today's recovery status)
            |-- SessionCard[] (per session)
            |   |-- ConfettiBurst
            |   +-- RepTimer (strength sessions)
            |-- ConsistencyHeatmap
            |-- Weekly Rhythm grid
            |-- LogModal (Sheet)
            |-- RecoveryPanel (Sheet)
            |   |-- ScreenshotUpload (x2: Eight Sleep, Oura)
            |   |-- MetricInput / TextMetricInput / SelectMetricInput
            |   |-- RecoveryHistory (14-day charts)
            |   +-- ExportButton
            +-- SettingsSheet (Sheet)
                |-- Level selector
                |-- Theme selector
                |-- Notification reminders
                +-- SMSConfig
```

### Data Flow

```
User Action
  -> Zustand Store (immediate local update)
  -> localStorage (automatic via persist middleware)
  -> useSync.syncNow() (1-second debounce)
  -> POST /api/sync (validated with Zod)
  -> Redis WATCH/MULTI merge
  -> React Query invalidation (refetch on next focus)

On Page Load:
  -> Zustand rehydrates from localStorage
  -> useSync fetches GET /api/sync
  -> hydrateFromSync merges server data into store
  -> Pushes merged state back to server
```

### File Structure

```
workout-tracker/
  src/
    app/
      layout.tsx                    # RootLayout: ClerkProvider, Providers, SW registration
      page.tsx                      # Dashboard: auth gate, store wiring, sync
      globals.css                   # CSS variables, dark/light mode, touch targets
      sign-in/[[...sign-in]]/page.tsx
      sign-up/[[...sign-up]]/page.tsx
      api/
        sync/route.ts               # GET/POST user data sync
        recovery/route.ts            # Recovery data + SMS phone management
        extract-metrics/route.ts     # AI screenshot scanning (Claude Haiku)
        health/route.ts              # Health check endpoint
        twilio/
          webhook/route.ts           # Inbound SMS handler
          send-reminder/route.ts     # Daily cron reminder sender
    components/
      Providers.tsx                  # QueryClientProvider + ErrorBoundary
      RecoveryPanel.tsx              # Full recovery panel (530 lines)
      dashboard/
        SessionCard.tsx              # Workout session card with animations
      layout/
        Header.tsx                   # App header with greeting and buttons
        LandingPage.tsx              # Marketing page for unauthenticated users
      progress/
        Heatmap.tsx                  # 8-week consistency heatmap
        StreakCounter.tsx             # Streak and weekly stats
        WeekRhythm.tsx               # 7-day selector with dates
      recovery/
        RecoveryBanner.tsx           # Recovery status inline banner
      settings/
        SettingsSheet.tsx            # Settings bottom sheet
        SMSConfig.tsx                # SMS phone configuration
      tracking/
        ConfettiBurst.tsx            # Completion animation
        LogModal.tsx                 # Workout log entry sheet
        RepTimer.tsx                 # Super-slow rep timer
      ui/
        ErrorBoundary.tsx            # Error boundary with fallback UI
        Sheet.tsx                    # Reusable bottom sheet
        Skeleton.tsx                 # Loading skeleton components
    hooks/
      useWorkoutStore.ts             # Zustand store with persist
      useSync.ts                     # React Query sync hook
      useTheme.ts                    # Theme management hook
    lib/
      helpers.ts                     # Date, streak, recovery level utilities
      redis.ts                       # Shared ioredis client singleton
      twilioParser.ts                # SMS parsing (Eight Sleep + DONE commands)
      validators.ts                  # Zod schemas for API validation
      workoutData.ts                 # All workout definitions and categories
    types/
      workout.ts                     # TypeScript type definitions
    __tests__/
      helpers.test.ts                # 16 tests for helper functions
      twilioParser.test.ts           # 10 tests for SMS parsing
      validators.test.ts             # 14 tests for Zod schemas
    middleware.ts                     # Clerk auth middleware
  public/
    manifest.json                    # PWA manifest
    sw.js                            # Service worker (offline sync, caching)
    icon-192.png                     # App icon 192x192
    icon-512.png                     # App icon 512x512
  vercel.json                        # Cron job config (daily 13:00 UTC)
  vitest.config.ts                   # Vitest config with path aliases
  .npmrc                             # legacy-peer-deps for Clerk
```

---

## API Endpoints

| Endpoint | Method | Auth | Purpose | Request | Response |
|----------|--------|------|---------|---------|----------|
| `/api/sync` | GET | Clerk | Fetch user's synced data | - | `{ data: SyncData \| null }` |
| `/api/sync` | POST | Clerk | Push user data to server | `SyncPayload` (validated by `syncBodySchema`) | `{ success: true }` |
| `/api/recovery` | GET | Clerk | Fetch recovery data by date | `?date=YYYY-MM-DD` | `{ data: RecoveryEntry \| null }` |
| `/api/recovery` | POST | Clerk | Phone management + SMS actions | `{ action, ...params }` (validated by `recoveryActionSchema`) | Varies by action |
| `/api/extract-metrics` | POST | None | AI screenshot metric extraction | `{ imageDataUrl, source }` | `{ metrics, source }` |
| `/api/health` | GET | None | System health check | - | `{ status, version, uptime, checks, timestamp }` |
| `/api/twilio/webhook` | POST | Twilio signature | Inbound SMS handler | Twilio form data | TwiML XML response |
| `/api/twilio/webhook` | GET | None | Webhook status check | - | `{ status }` |
| `/api/twilio/send-reminder` | POST | CRON_SECRET | Send daily reminders | - | `{ success, sentTo, day, workout }` |
| `/api/twilio/send-reminder` | GET | None | Reminder config check | - | `{ status, usersWithPhone, legacyPhoneConfigured, twilioConfigured }` |

### Recovery POST Actions

| Action | Parameters | Response |
|--------|-----------|----------|
| `set-phone` | `phone: string` (min 10 chars) | `{ success, phone }` |
| `get-phone` | - | `{ phone }` |
| `get-completions` | - | `{ completions: [] }` |
| `test-sms` | - | `{ success, message }` |

---

## Data Models (from `src/types/workout.ts`)

### WorkoutLogEntry
```typescript
{
  notes?: string;           // Free-text workout notes
  duration?: number;         // Duration in minutes
  feeling?: 1 | 2 | 3 | 4 | 5;  // Emoji scale rating
  completedAt?: string;      // ISO timestamp
}
```

### CompletionRecord
```typescript
Record<string, boolean>     // Key format: "weekKey:dayName:sessionSlug"
```

### NotificationSettings
```typescript
{
  enabled: boolean;
  times: Record<string, string>;  // Day name -> "HH:MM" time string
}
```

### RecoveryEntry
```typescript
{
  date: string;
  eightSleep?: {
    sleepFitnessScore?: number;
    timeSlept?: string;
    deepSleep?: string;
    deepSleepPct?: number;
    remSleep?: string;
    remSleepPct?: number;
    rhr?: number;
    hrv?: number;
    screenshotDataUrl?: string;
    autoImported?: boolean;
    importedAt?: string;
  };
  oura?: {
    readinessScore?: number;
    sleepScore?: number;
    totalSleep?: string;
    efficiency?: number;
    restfulness?: string;
    remSleep?: string;
    remSleepPct?: number;
    deepSleep?: string;
    deepSleepPct?: number;
    latency?: number;
    timing?: string;
    hrv?: number;
    rhr?: number;
    bodyTemp?: number;
    respiratoryRate?: number;
    screenshotDataUrl?: string;
  };
}
```

### SyncPayload / SyncData
```typescript
{
  completions?: CompletionRecord;
  logs?: WorkoutLogRecord;
  level?: Level;
  recovery?: RecoveryData;
  updatedAt?: number;  // SyncData only
}
```

### WorkoutSession (from `workoutData.ts`)
```typescript
{
  title: string;
  subtitle?: string;
  category: "strength" | "cardio" | "recovery" | "flexibility" | "posture" | "meditation" | "adventure" | "social" | "brain";
  timeOfDay: string;
  icon: string;
  levels: {
    beginner: { warmup?: string; instructions: string; exercises?: Exercise[]; duration?: string; };
    intermediate: { ... };
    advanced: { ... };
  };
}
```

### Zod Validation Schemas (from `validators.ts`)

- `logEntrySchema` - validates workout log entries (notes max 2000 chars, duration non-negative, feeling 1-5)
- `syncBodySchema` - validates sync payloads (completions, logs, level enum, recovery with nested schemas)
- `recoveryActionSchema` - discriminated union for recovery POST actions
- `extractMetricsSchema` - validates image data URL and source type

---

## Redis Key Schema (User-Scoped)

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `user:{userId}:data` | JSON string | Full sync payload (completions, logs, level, recovery) |
| `user:{userId}:phone` | string | User's phone number for SMS |
| `user:{userId}:recovery:{date}` | JSON string | Recovery data for a specific date |
| `user:{userId}:completion:{date}:{day}` | JSON string | SMS-logged completion record |
| `user:{userId}:sms-completions` | JSON array | List of SMS completions (max 30) |
| `phone:{phone}:userId` | string | Reverse phone-to-user mapping for webhook |

### Legacy Keys (backward compatibility)
| Key | Purpose |
|-----|---------|
| `recovery:{date}` | Global recovery data |
| `sms:user-phone` | Global phone number |
| `sms:completions` | Global SMS completions |

---

## Security Model

1. **Clerk Authentication** - All dashboard routes protected by `clerkMiddleware`; API routes (sync, recovery) verify `userId` via `auth()` and return 401 if missing
2. **Twilio Signature Validation** - Webhook validates `x-twilio-signature` header using `twilio.validateRequest()` in production
3. **CRON_SECRET** - Send-reminder endpoint requires `Bearer {CRON_SECRET}` authorization header
4. **Zod Validation** - All API POST bodies validated with Zod schemas before processing; invalid payloads return 400 with error details
5. **User-Scoped Redis Keys** - All data keyed by Clerk userId; no user can access another user's data
6. **Image Size Limits** - Screenshot uploads capped at 5MB with client-side compression
7. **SMS Completion List** - Capped at 30 entries to prevent unbounded growth

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend auth |
| `CLERK_SECRET_KEY` | Yes | Clerk backend auth |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | Sign-in page path (`/sign-in`) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | Sign-up page path (`/sign-up`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Yes | Redirect after sign-in (`/`) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Yes | Redirect after sign-up (`/`) |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio API auth |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio API auth + webhook validation |
| `TWILIO_PHONE_NUMBER` | Yes | Outbound SMS sender number |
| `KV_REDIS_URL` | Yes | Redis connection URL (ioredis) |
| `CRON_SECRET` | Yes | Cron job authorization |
| `ANTHROPIC_API_KEY` | No | Required for AI screenshot scanning |
| `KV_REST_API_URL` | No | Fallback Redis URL (legacy) |

---

## Testing

- **Framework:** Vitest with Node environment
- **Path aliases:** Configured via `vitest.config.ts` matching `tsconfig.json` paths
- **Test files:** 3 test suites in `src/__tests__/`
  - `helpers.test.ts` - 16 tests covering weekKey, sessionSlug, sessionKey, calculateStreak, getBestStreak, getWeekProgress, getRecoveryLevel, getGreeting
  - `twilioParser.test.ts` - 10 tests covering Eight Sleep SMS parsing and DONE command parsing
  - `validators.test.ts` - 14 tests covering syncBodySchema, recoveryActionSchema, logEntrySchema
- **Total: 40 passing tests**
- **Scripts:** `npm test` (run once), `npm run test:watch` (watch mode)

---

## Known Limitations

1. **Streak calculation O(365)** - `calculateStreak` and `getBestStreak` iterate up to 365 days on every call; memoized with `useMemo` but still recalculates on any completion change
2. **No rate limiting** - API routes unprotected from abuse beyond auth checks
3. **Screenshot data in Zustand** - Recovery screenshots (base64 data URLs) stored in Zustand persist, which can bloat localStorage
4. **No background push notifications** - Notification reminders are client-side time pickers but actual push notification scheduling is not implemented; SMS reminders are the primary notification channel
5. **Extract-metrics endpoint not auth-gated** - The `/api/extract-metrics` route does not require Clerk auth
6. **Twilio toll-free verification** - Pending approval for outbound SMS to unverified numbers
7. **No E2E tests** - Only unit tests for pure functions; no integration or E2E test coverage
8. **Legacy key migration** - Some API routes still fall back to global Redis keys for backward compatibility with pre-auth data
9. **No Oura/Eight Sleep direct API integration** - All recovery data entered manually or via SMS/screenshot; no OAuth token-based API connections

---

## V3 Roadmap Ideas

- **Persist push notification subscriptions** in Redis for true web push notifications
- **Marker clustering** for heatmap at larger scales
- **Wind/weather integration** for outdoor Saturday adventures
- **Workout timer** - built-in interval timer for VO2 max training sets
- **Direct API connections** - Oura Ring API, Eight Sleep API (eliminate manual input)
- **Social features** - share progress, challenge friends, leaderboards
- **Trend analytics** - long-term graphs for recovery score, HRV, workout volume
- **Cleanup dead code** - remove legacy global Redis key fallbacks
- **Rate limiting** - add rate limiting middleware to API routes
- **E2E testing** - Playwright or Cypress test suite for critical user flows
