# Workout Tracker

A personal training app: a weekly program with timers, daily logging, and reminders. Built for one user's routine, installable on a phone.

Live at [workout-tracker-two-alpha.vercel.app](https://workout-tracker-two-alpha.vercel.app), behind Clerk sign-in.

## What it does

| Feature | Where in the code |
| --- | --- |
| A 7-day program view with three tiers (beginner, intermediate, advanced) and built-in interval and rep timers | [src/lib/workoutData.ts](src/lib/workoutData.ts) |
| Message-based logging: an inbound text message webhook parses entries into the user's log | [src/app/api/twilio/webhook](src/app/api/twilio/webhook/route.ts), [src/lib/twilioParser.ts](src/lib/twilioParser.ts) |
| Scheduled jobs: daily data syncs and reminder and status messages every 15 minutes | [src/app/api/cron](src/app/api/cron) |
| Optional data-source integrations, connected per user | [src/app/api](src/app/api) |
| Metric extraction from uploaded images, using a hosted AI model | [src/app/api/extract-metrics](src/app/api/extract-metrics/route.ts) |
| Browser push notifications | [src/lib/webpush.ts](src/lib/webpush.ts) |
| An install sheet: a native prompt on Chrome/Edge, an Add-to-Home-Screen walkthrough on iOS Safari | [src/components/InstallSheet.tsx](src/components/InstallSheet.tsx) |

## How it works

A Next.js app router project. Sign-in and route protection come from Clerk ([src/middleware.ts](src/middleware.ts)). Per-user data lives in Redis, reached through `ioredis` with a Vercel KV connection URL ([src/lib/redis.ts](src/lib/redis.ts)). Client state uses Zustand and TanStack Query. Vercel Cron calls the routes under `src/app/api/cron` on the schedules in [vercel.json](vercel.json). Outbound and inbound text messages go through Twilio. Push notifications use the Web Push standard with VAPID keys.

## Run locally

Requires Node with Next ^14.2.35 and React ^18.3.1 (pinned in [package.json](package.json)), plus a `.env.local` with the vars below.

```bash
npm install
npm run dev     # next dev
npm run build   # next build
npm run start   # next start
npm run lint    # eslint
npm test        # vitest run
```

## Configuration

| Var | Purpose |
| --- | --- |
| `CLERK_SECRET_KEY` | Clerk server key for sign-in and route protection. |
| `KV_REDIS_URL`, `KV_REST_API_URL` | Redis connection URL; the first one set is used. |
| `CRON_SECRET` | Shared secret the cron routes check on each call. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Twilio account and sending number for text messages. |
| `PHONE_ENCRYPTION_KEY` | Key used to encrypt a stored contact field at rest. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push key pair and contact subject. |
| `ANTHROPIC_API_KEY` | Hosted AI model for image extraction and the in-app assistant. |
| `GOOGLE_AI_API_KEY` | Optional. Only the health check route reads it, to report whether it is set; no feature in src calls a second AI provider. |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app. |
| `NODE_ENV` | Standard Node environment flag. |
| (vendor vars) | Credentials for optional data-source integrations (see src/app/api). |

All values live in the Vercel project settings, not the repo.

## Tests

Vitest with happy-dom, jsdom and Testing Library. [src/__tests__](src/__tests__) covers the API routes (with mocked Clerk and Redis), the cron jobs, the message parser, validators, program data and timer parsing, push, sync and account-switch flows, and several UI components. It does not exercise live third-party services or a real browser.

As of 2026-10-05: 56 test files, 485 passed, 2 skipped, 0 failed.

## Deploy

Vercel. [vercel.json](vercel.json) defines four cron schedules: two daily syncs and two jobs every 15 minutes.

<!-- CONFIRM: whether git push deploys or a manual `vercel --prod` is required -->
