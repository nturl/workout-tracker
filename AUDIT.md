# Workout Tracker Audit - 2026-04-07

## Bugs to Fix

### 1. Circuit Timer not showing (HIGH)
**File:** `src/app/page.tsx:197`
**Problem:** `showTimer={level !== "advanced"}` - the timer is hidden when user level is "advanced". Since you're likely on advanced, the CircuitTimer never renders.
**Fix:** Change to `showTimer={true}` or at minimum show it for cardio regardless of level. The RepTimer (super-slow) being level-gated makes sense, but the circuit timer should always show for timed workouts.

### 2. Twilio webhook phone lookup may fail silently (MEDIUM)
**File:** `src/app/api/twilio/webhook/route.ts:54-61`
**Problem:** `findUserByPhone(from)` hashes the raw Twilio `From` value. If the format ever differs from how it was stored (recovery API normalizes to `+1XXXXXXXXXX`), the hash won't match and completions go to global keys instead of user-scoped keys.
**Current state:** Twilio sends E.164 format (`+1XXXXXXXXXX`) which matches the storage format, so this should work. But there's no normalization safety net.
**Fix:** Add normalization in `findUserByPhone()`:
```ts
const normalized = phone.replace(/\D/g, "");
const formatted = normalized.length === 10 ? `+1${normalized}` : `+${normalized}`;
const hashed = hashPhone(formatted);
```

### 3. Silent decryption failures in send-reminder (LOW)
**File:** `src/app/api/twilio/send-reminder/route.ts:88-89`
**Problem:** If phone decryption fails, the user is silently skipped with no logging.
**Fix:** Add `console.error()` in the catch block.

### 4. Old phone hash not cleaned up on phone change (LOW)
**File:** `src/app/api/recovery/route.ts:53-66`
**Problem:** When a user changes their phone number, the old `phone-hash:{hash}:userId` mapping isn't deleted.
**Fix:** Before saving new phone, decrypt old phone, hash it, and delete the old mapping.

## Features to Ship

### 5. Chat PWA optimization (DONE - deployed)
Full-screen chat panel replacing the 60vh sheet. Uses visualViewport API for keyboard handling, safe area insets, enterKeyHint="send".

### 6. Circuit Timer (DONE - deployed, but blocked by bug #1)
Built at `src/components/tracking/CircuitTimer.tsx`. Parses exercises with `(30s)` notation, provides play/pause/skip/reset, audio beeps, haptic feedback, 3-2-1 countdown.

### 7. Exercise display clarity (DONE - deployed)
Orange duration badges on timed exercises, helper text pointing to timer.

## Verified Clean

- All Terra/Apple Health code fully removed (0 references)
- All 13 API routes present and importable
- All component imports valid
- No broken imports or dead code
- No TODO/FIXME markers
- All Vercel env vars set (PHONE_ENCRYPTION_KEY, CRON_SECRET, Twilio, Oura, Clerk, Google AI, Redis)
- Cron jobs configured: sync-recovery 11:00 UTC, send-reminder 13:00 UTC

## Priority for Next Session

1. Fix `showTimer` to always be true (1 line change, bug #1)
2. Test circuit timer on Tuesday's card after fix
3. Test Twilio end-to-end (send a text, check Redis for completion)
4. Add phone normalization safety net (bug #2)
5. Add decryption error logging (bug #3)
6. Deploy
