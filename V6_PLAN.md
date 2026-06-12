# V6 Plan - UI Polish, SMS Fix, Sunset/Sunrise

**Date:** 2026-04-07
**Status:** In Progress

---

## 1. SMS Fix (Critical)

**Bug found:** Vercel crons send GET requests, but `/api/twilio/send-reminder` only sends SMS in the POST handler. The GET handler just returns a status JSON. Texts have never been sent by the cron.

**Fix:**
- Move the SMS-sending logic into the GET handler (or a shared function called by both)
- Add proper `CRON_SECRET` validation for GET (Vercel sends `Authorization: Bearer <secret>`)
- Add a debug/test endpoint that reports config status without sending

---

## 2. UI Polish ("sexy and clean")

### 2a. Design System Upgrades (globals.css)
- Add accent color variables (blue-cyan gradient for primary actions)
- Add shadow system (card shadow, elevated shadow, glow)
- Add glassmorphism utility (backdrop-blur + semi-transparent bg)
- Add subtle gradient backgrounds for sections

### 2b. Header + Stats
- Glassmorphism header bar with backdrop blur
- Gradient-accented stat cards (streak gets fire gradient when active)
- Glowing progress bar with colored shadow
- Better typography contrast

### 2c. Session Cards
- Category-specific gradient accent bars (thicker, more visible)
- Subtle card shadows for depth
- Better hover/active states
- More prominent completion state

### 2d. Landing Page
- Already pretty good - minor refinements only
- Ensure consistency with new accent system

---

## 3. Sunset/Sunrise Display

- New `SunTimes` component showing today's sunrise/sunset
- Calculate locally using solar position formula (no external API dependency)
- Display in recovery banner area or header
- Tie into time-of-day workout recommendations:
  - "Morning session" = within 2hrs of sunrise
  - "Evening session" = at least 3hrs before sunset
  - Show contextual nudges based on current time vs sun position

---

## Execution Order
1. SMS fix (quick win, critical bug)
2. UI polish (bulk of work)
3. Sunset/sunrise (feature add)
4. Tests + deploy
