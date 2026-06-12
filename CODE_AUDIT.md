# Code Audit: Boundless Workout Tracker V1

**Date:** March 30, 2026
**Auditor:** Claude (automated)
**Scope:** Full codebase review — architecture, security, performance, UX, mobile/PWA

---

## Executive Summary

The V1 is a **solid prototype** with impressive feature scope (SMS logging, recovery tracking, PWA, AI screenshot scanning, cross-device sync). However, it has critical architectural issues that block scaling to a production-ready V2. The main page is a **1273-line monolith** combining UI, state management, persistence, and business logic. Security, testing, and multi-tenancy are absent.

**Verdict:** Strong foundation to build V2 on. Needs decomposition, security hardening, and design system before it's production-grade.

---

## Critical Issues (Must Fix for V2)

### 1. Monolithic page.tsx (1273 lines)
**Location:** `src/app/page.tsx`
**Problem:** Single file contains:
- 18+ useState hooks
- 9 inline component definitions (ConfettiBurst, RepTimer, LogModal, SMSSettings, SettingsPanel, SessionCard, WeekRhythm, ConsistencyHeatmap, LandingPage)
- Persistence logic (localStorage read/write, migration, user-scoping)
- Business logic (streak calculation, week summary, notification scheduling)
- Server sync (fetch + debounce)
- Theme management

**Impact:** Untestable, unmaintainable, every state change re-renders everything.

**V2 Fix:** Decompose into ~15 files with clear boundaries (see V2_PLAN.md).

### 2. No Twilio Webhook Signature Validation
**Location:** `src/app/api/twilio/webhook/route.ts:6-9`
**Problem:** `validateTwilioRequest()` always returns `true`. Anyone can POST fake SMS commands to log workouts, change phone numbers, or spam the system.
**V2 Fix:** Use Twilio's `validateRequest()` to verify X-Twilio-Signature header.

### 3. Data Not Scoped by User (Multi-Tenancy)
**Location:** Multiple API routes
**Problem:** KV keys like `sms:user-phone`, `recovery:{date}`, `sms:completions`, `completion:{date}:{day}` are global. If two users sign up, they share the same phone number and recovery data.
**V2 Fix:** Prefix all KV keys with `user:{userId}:`.

### 4. No Tests
**Problem:** Zero test files. No unit tests for SMS parsing, streak calculation, data migration, or API routes. No integration tests. No E2E.
**V2 Fix:** Add Vitest for unit/integration, Playwright for E2E.

### 5. No Error Boundaries
**Problem:** Any runtime error crashes the entire app to a blank white screen. No fallback UI.
**V2 Fix:** Add React error boundaries at layout and component level.

---

## High Priority Issues

### 6. No Input Validation on API Routes
**Locations:** All route.ts files
**Problem:** API routes use `as` casts and trust incoming data blindly. No schema validation.
**V2 Fix:** Add Zod schemas for all request/response bodies.

### 7. No Rate Limiting
**Problem:** All API endpoints are unprotected. Could be abused for SMS spam, AI cost attacks, or sync flooding.
**V2 Fix:** Add Upstash rate limiting or Vercel's built-in edge rate limiting.

### 8. Sync Conflict Resolution is Naive
**Location:** `src/app/api/sync/route.ts`
**Problem:** `{ ...existing, ...incoming }` — last write wins at the top level. Fine-grained changes (e.g., user completes workout on phone, logs notes on laptop) can overwrite each other.
**V2 Fix:** Merge at field level with timestamps, or use a CRDT-like approach.

### 9. Phone Number Stored Unencrypted
**Location:** Redis key `sms:user-phone`
**Problem:** Plaintext phone number in KV store. Data breach = exposed PII.
**V2 Fix:** Encrypt with `crypto.subtle` before storing.

### 10. No Loading States
**Problem:** API calls (sync, recovery fetch) have no loading indicators. User sees stale data with no indication that fresh data is being fetched.
**V2 Fix:** Skeleton loaders, React Query loading states, or Suspense boundaries.

---

## Medium Priority Issues

### 11. Streak Calculation O(365) Per Render
**Location:** `src/app/page.tsx` (calculateStreak function)
**Problem:** Iterates 365 days on every state change. Not memoized.
**Fix:** Wrap in `useMemo` with completions as dependency.

### 12. CSS Variables + Tailwind Conflict
**Problem:** Theme uses CSS custom properties (--bg-primary, --text-primary, etc.) while Tailwind has its own theming. Two parallel systems create inconsistency.
**Fix:** Unify on Tailwind `dark:` classes or CSS variables, not both.

### 13. Service Worker is Minimal
**Location:** `public/sw.js`
**Problem:** Only caches "/" page. No API caching, no background sync, no push notifications. Cache version hardcoded.
**Fix:** Implement stale-while-revalidate for API, background sync queue for offline completions.

### 14. No Safe Area Handling (iPhone)
**Problem:** No `env(safe-area-inset-*)` padding. Content can be hidden behind iPhone notch/Dynamic Island.
**Fix:** Add safe area CSS to layout.

### 15. Next.js Config is Empty
**Location:** `next.config.mjs`
**Problem:** No security headers, no image optimization config, no compression settings.
**Fix:** Add headers, image config, and PWA plugin.

### 16. Notification Scheduling Uses Window Globals
**Location:** `src/app/page.tsx`
**Problem:** `(window as unknown as Record<string, unknown>).__notifTimers` — stores timer IDs as window properties. SSR-unsafe, type-unsafe, memory leak risk.
**Fix:** Use a ref or cleanup in useEffect.

### 17. Recovery Panel Not User-Scoped
**Location:** `src/components/RecoveryPanel.tsx`
**Problem:** Recovery data stored in localStorage under `workout-recovery` without user prefix. Different users on same browser share recovery data.
**Fix:** Use user-scoped key `u:{userId}:workout-recovery`.

### 18. Tailwind Config Has No Design Tokens
**Location:** `tailwind.config.js`
**Problem:** Empty `extend` object. All colors/spacing hardcoded in components.
**Fix:** Define brand colors, semantic tokens, and spacing scale.

---

## Low Priority Issues

### 19. ESLint Config Mismatched
**Problem:** `eslint-config-next: 16.2.1` with `eslint: ^9`. Config may not be applying.

### 20. No Accessibility Audit
**Problem:** Touch targets may be too small (some use `text-[10px]`). `maximumScale: 1` prevents pinch zoom. No ARIA labels on interactive elements.

### 21. Confetti Animation Performance
**Problem:** 24 CSS particles on completion. May lag on low-end devices.

### 22. No prefers-reduced-motion Respect
**Problem:** Animations play even for users who've enabled reduce-motion accessibility setting.

---

## Security Summary

| Issue | Severity | Status |
|-------|----------|--------|
| Twilio webhook not validated | CRITICAL | Open |
| Global phone number (not user-scoped) | CRITICAL | Open |
| Recovery data shared across users | HIGH | Open |
| No rate limiting on APIs | HIGH | Open |
| Phone number unencrypted in Redis | HIGH | Open |
| No CSRF protection | MEDIUM | Open |
| No input validation (Zod) | MEDIUM | Open |
| API errors may leak internals | MEDIUM | Open |
| localStorage unencrypted | LOW | Acceptable for PWA |

---

## Performance Summary

| Issue | Impact | Fix Effort |
|-------|--------|------------|
| 1273-line monolith re-renders on every state change | HIGH | HIGH (decompose) |
| 18 useState hooks, no memoization | HIGH | MEDIUM (zustand + useMemo) |
| O(365) streak calculation per render | MEDIUM | LOW (useMemo) |
| No code splitting (landing page + app in one route) | MEDIUM | MEDIUM (separate routes) |
| localStorage read on every render | MEDIUM | LOW (cache in state) |
| No image optimization config | LOW | LOW (next.config) |

---

## File-by-File Summary

| File | Lines | Purpose | Grade | Notes |
|------|-------|---------|-------|-------|
| `page.tsx` | 1273 | Everything | D | Must decompose |
| `RecoveryPanel.tsx` | 481 | Recovery UI | C+ | Large but functional; needs user-scoping |
| `workoutData.ts` | 468 | Workout definitions | B | Good structure, could be JSON/CMS |
| `twilioParser.ts` | 105 | SMS parsing | B+ | Solid regex, needs tests |
| `redis.ts` | 19 | Redis client | B | Simple, works. Add error handling |
| `sync/route.ts` | 46 | Cross-device sync | C | Works but naive merge, no validation |
| `recovery/route.ts` | 90 | Recovery API | C | Not user-scoped, no validation |
| `extract-metrics/route.ts` | 68 | AI scanning | B- | Good, not wired to UI yet |
| `twilio/webhook/route.ts` | 155 | SMS webhook | D | No signature validation = critical |
| `twilio/send-reminder/route.ts` | 138 | Daily reminders | C | Single-user only, no retry |
| `middleware.ts` | 18 | Auth routing | A- | Clean, correct |
| `layout.tsx` | 73 | Root layout | B | Works, needs error boundary |
| `sign-in/page.tsx` | 18 | Auth page | A | Simple, correct |
| `sign-up/page.tsx` | 18 | Auth page | A | Simple, correct |
| `sw.js` | 36 | Service worker | D+ | Barely caches anything |
| `manifest.json` | 28 | PWA manifest | C | Minimal, no shortcuts |
| `next.config.mjs` | 6 | Next config | D | Empty |
| `tailwind.config.js` | 20 | Tailwind | D | No design tokens |
| `globals.css` | 94 | Styles | B | Good CSS variables |

---

## Recommendations for V2

1. **Architecture:** Split page.tsx into 15+ components with Zustand state management
2. **Security:** Validate Twilio webhooks, scope all data by userId, add rate limiting
3. **Data:** Zod validation everywhere, field-level sync merging, offline queue
4. **Testing:** Vitest unit tests, Playwright E2E, MSW for API mocking
5. **UX:** Design system with Tailwind tokens, skeleton loaders, animations with Framer Motion
6. **Mobile:** Safe area padding, larger touch targets, pull-to-refresh, proper offline mode
7. **Observability:** Sentry error tracking, Web Vitals, analytics events
8. **PWA:** Proper service worker with caching strategies, background sync, push notifications

See **V2_PLAN.md** for the full implementation roadmap.
