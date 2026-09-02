# workout-tracker bug hunt — orchestrator prompt

Launch on Fable via `/fable` (gate first). Fable is the orchestrator only: it plans, dispatches, reads reports, adjudicates, and writes the final ledger. Every keystroke in the repo (reads of big files, test writing, browser driving) goes to Sonnet subagents. Opus only for a single stuck root-cause. Never Haiku.

---

## TASK CARD

**Task.** Find, reproduce, and rank every bug in `~/dev/workout-tracker` (live at https://workout-tracker-two-alpha.vercel.app/). This is a FIND run, not a fix run. Noel already knows of bugs in the habit tracker and in the UI around the timers. There are more.

**Inputs.**
- Repo: `~/dev/workout-tracker` (Next.js 14 app router, React 18, zustand+persist, TanStack Query, Clerk, Redis via ioredis/@vercel/kv, vitest). Read `AGENTS.md` first (Next.js version is newer than training data; read `node_modules/next/dist/docs/` before assuming an API).
- Last two shipped commits: `96b3608` (V32 full UI redesign, 51 files, 34 of them produced by Kimi lanes that were never read line by line) and `989297d` (habit tri-state check/X). Then `a1fc72f` (cron habit-status export). Expect the redesign commit to be the richest bug seam.
- Session note with known gaps: `notes/session-2026-08-26.md`. Its "ASSUMED / UNVERIFIED" list is a starting queue, not the whole hunt.
- Test suite: `npm test` (373 passing, 38 files), `npm run lint`, `npx tsc --noEmit`, `npm run build`. All green at HEAD. Green tests are not evidence of correctness here; the redesign was verified in aggregate only.
- Design contract: `DESIGN_SPEC.md` (per-lane invariants list). A UI that violates it is a bug.
- Local dev: `.claude/launch.json` entry `workout-dev` on port 3001. `preview_start` resolves launch.json against the session's primary cwd, so run this session rooted at `~/dev/workout-tracker`. `.env.local` is already pulled from Vercel. If local preview is blocked, drive production instead (see Permissions).

**Output.** `notes/BUGS-2026-09-01.md` in the repo: one entry per bug, ranked by severity, in the format under "Ledger format" below. Plus a failing vitest per bug where one is writable (new files under `src/__tests__/bugs/`, never edits to existing tests). Plus screenshots in `notes/bugs/` for visual bugs.

**Proof.** Every ledger entry is tagged VERIFIED (reproduced live, or failing test written and run, or file read and the wrong branch traced with line numbers) or INFERRED (pattern match only). INFERRED entries go in a separate bottom section and count for nothing. Grep hits are leads, not findings. Reading the file is the minimum bar.

**Permissions.**
- Read anything in the repo. Write only under `src/__tests__/bugs/` and `notes/`. No edits to `src/` outside tests. No commits, no `vercel --prod`.
- Browser: the app is a real account with real habit history and the habit "unrecorded" state is permanently unreachable once written (sync route deep-merges, nothing tombstones). Do NOT tap check or X on Noel's real habits, do not delete or rename his habits, do not log workouts against his account. State-mutating browser tests run either (a) on the local dev server against a throwaway Clerk sign-up, or (b) on production signed in to a throwaway account created for this run. Read-only inspection of the real account (render, console, network, layout) is fine.
- No `rm`, no git history commands.

**Stop-when.** Every area in the Coverage Map below has a lane report, the adversarial review has run, the ledger is written, and `npm test` still passes on the pre-existing suite (new bug tests are allowed to fail; mark them `it.fails` or `describe.skip` with a `BUG-NN` tag so the suite is green for the next person). Cap: 40 orchestrator turns. If the cap is near and areas remain, write the ledger with the remaining areas listed as NOT COVERED.

**Escalate-when.** A lane reports a bug whose root cause cannot be traced in two Sonnet attempts (dispatch one Opus sleuth on that single bug). Any credential, secret, or live-key issue is found (record it, touch nothing, tell Noel). Any lane wants to modify `src/` (refuse; ledger it as a proposed fix).

---

## COVERAGE MAP (each row becomes at least one Sonnet lane)

Dispatch lanes in parallel where independent. Each lane gets: the files in scope, the seeded hypotheses for its area, the proof standard, and a return format (list of `{title, severity, file:line, repro, root cause, evidence type}`). Lanes must READ their files fully, not grep them.

### A. Habit tracker: data model and streaks
Files: `src/lib/habits.ts`, `src/lib/helpers.ts` (streak functions, `todayKey`, `dateKey`, week helpers), `src/hooks/useWorkoutStore.ts` (`toggleHabit`, `setHabit`, `migrateHabitsState`, `mergeHabitDefs`, `hydrateFromSync`, add/rename/reorder/delete habit actions), `src/lib/validators.ts` (`syncBodySchema`), `src/app/api/sync/route.ts`, `src/app/api/cron/habit-status/route.ts`, `src/__tests__/helpers.test.ts`.
Seeded hypotheses (confirm or kill each, with evidence):
1. Tri-state collision: `false` means both "explicitly missed" (new) and "unchecked via old toggle" (legacy). Days Noel unchecked before `989297d` now render as red X. Is that a rendering bug, a data bug, or accepted? Ledger it with the count of affected real dates if readable.
2. Streak grace period: `calculateDailyHabitStreak` keeps the streak when today is `undefined` but breaks on `false`. Check the same rule in every other streak/heatmap/momentum consumer; a consumer that treats `false` and absent identically now disagrees with the card.
3. Date keys are local time (`todayKey` builds from `getFullYear/getMonth/getDate`). Check `api/cron/habit-status` and `api/cron/send-status` and `send-reminder`: do they compute "today" in UTC on the Vercel server? A habit checked at 11pm ET would then be read as tomorrow or missing by the cron. Write the test.
4. Midnight rollover: is `todayKey()` memoised or captured in a `useMemo`/`useState` so an app left open past midnight (PWA on the home screen, very common) keeps writing to yesterday's key? Trace every call site.
5. Week helpers start on Sunday (`getDay()` offset). Check WeekRhythm, Heatmap, MomentumChart, StreakCounter for a mixed Monday/Sunday assumption and for off-by-one at week boundaries and DST transitions.
6. `deepMerge` in the sync route: a habit deleted locally is resurrected on next hydrate; a date key set to `false` locally can be overwritten by a stale `true` from another device or from the 60s `Cache-Control: private, max-age=60` on GET combined with 5-minute `staleTime`. Enumerate the concrete sequences that lose a check.
7. `mergeHabitDefs` tie-break uses `JSON.stringify(a) > JSON.stringify(b)`. Construct the case where a rename is silently reverted.
8. `makeHabitId`: rename does not change id (good) but adding a habit whose label kebab-cases to an existing id gets `-2`. Deleting a habit leaves its completion history in `habits[id]` forever, and re-adding the same label later resurrects the old streak under the same id. Confirm.
9. `migrateHabitsState` version gates: does `persist` config declare the version that matches? A user on v2 storage with an empty `habitDefs` array: what happens?
10. `LEGACY_HABIT_IDS` migration runs on hydrate too, or only on local persist? A device that never had legacy fields but receives them from server data.

### B. Habit tracker: UI
Files: `src/components/tabs/WorkoutsTab.tsx` (Daily Habits section, inline edit mode), `src/components/progress/HabitCard.tsx`, `src/components/settings/HabitManager.tsx`, `src/components/progress/StreakCounter.tsx`, `src/components/progress/Heatmap.tsx`, `src/components/progress/WeekRhythm.tsx`, `src/components/progress/MomentumChart.tsx`.
Seeded hypotheses:
1. Two habit CRUD surfaces (inline in WorkoutsTab, and HabitManager in Settings). Do they share validation (empty label, whitespace-only label, 64-char cap, duplicate label, emoji), and does each call `syncNow()` after every mutation? Find the divergence.
2. Check and X are no-ops when already active, by design, but nothing in the UI says so. Also verify: tapping check then X in quick succession, double-tap, and tapping during an in-flight sync.
3. The `false` state has never been rendered in a browser (session note). Render it on a throwaway account in both themes at 390x844: red circle legibility, history-strip X, overflow, and the streak number the card shows next to it.
4. Edit mode: reorder arrows at the top and bottom of the list, rename to empty string, delete confirm then cancel, leave edit mode with a rename in progress, rotate device.
5. Recent-days strip: 7 days including today? Which end is today? Does it match Heatmap orientation?
6. Habit list scroll and keyboard: does the iOS keyboard cover the rename input, does Enter commit, does blur commit or discard?

### C. Timers: logic
Files: `src/components/tracking/CircuitTimer.tsx` (597 lines), `src/components/tracking/RepTimer.tsx`, `src/components/tracking/TimerRing.tsx`, `src/components/tracking/CountdownIntro.tsx`, `src/components/tracking/LogModal.tsx`, `src/components/tracking/ConfettiBurst.tsx`, `src/lib/audio.ts`, `src/components/dashboard/SessionCard.tsx`, `src/lib/workoutData.ts` (protocol definitions the timers consume), `src/hooks/useWorkoutStore.ts` (`TimerSettings`, `DEFAULT_TIMER_SETTINGS`).
Seeded hypotheses:
1. "Audio-clock driven, drift-free" tick loop (V20). What happens when the AudioContext is suspended (iOS background, silent switch, no gesture yet)? Does the clock stop, jump, or double-fire on resume? Trace `visibilitychange` handling in both timers; RepTimer has one for wake lock only.
2. Pause then resume: is elapsed recomputed from a stored start timestamp, or from accumulated ticks? Pause for 30s and check the ring and the seconds.
3. Phase transitions: work to rest, last rep of last set, bilateral switch mid-set. Check the off-by-one on `secondsLeft <= 3` countdown ticks (does it beep at 3,2,1 or 3,2,1,0 or 4,3,2?) and whether the rest phase of the final set is skipped or played.
4. Wake lock: released on pause, on unmount, on tab hide? Re-acquired on resume? `wakeLockRef` leak when the component unmounts while running.
5. SessionCard collapse keeps the timer mounted via `hidden`. Never verified live. Start a timer, collapse, wait, expand: does time advance, does audio still fire, does the ring resume from the right place, do two timers ever run at once if a second card is expanded?
6. Effect dependency arrays on the tick loops (RepTimer line ~185 lists protocol seconds and callbacks). Does changing a timer setting mid-run (audio toggle, haptics) restart the loop or reset the phase?
7. Navigating tabs (BottomNav) while a timer runs: is WorkoutsTab unmounted? If so the timer dies silently. If not, is there a running indicator elsewhere?
8. CountdownIntro: skip, double-start, and the 3-2-1 then timer start handoff (lost spring exit in V32; check it does not now flash or overlap).
9. LogModal after completion: what is prefilled, what happens on dismiss without saving, is the completion written before or after the modal, does a completed circuit count if the modal is cancelled?
10. Audio: `unlockAudio` on every gesture, but does the first beep of a session play on iOS Safari, and does `playCountdown` overlap with `playWorkStart` at phase boundaries?

### D. Timers: UI and layout
Same files as C plus `src/app/globals.css`, `tailwind.config.js`, `DESIGN_SPEC.md`.
Drive both timers live at 390x844 and desktop, light and dark, each phase. Look for: ring stroke not matching the number, text jumping width as digits change (tabular-nums), controls shifting between phases, contrast of the phase label on the accent background, `.anim-*` classes retriggering on every tick (re-mount animations firing each second is a classic post-redesign bug), safe-area at the bottom under the BottomNav, pressed state stuck on touch, focus ring missing on the primary control, `color-mix()` fallbacks. Screenshot every finding.

### E. Sync and persistence
Files: `src/hooks/useSync.ts`, `src/hooks/useWorkoutStore.ts` (persist config, `getSyncPayload`, subscribe), `src/app/api/sync/route.ts`, `src/lib/retry.ts`, `src/lib/rateLimit.ts`, `src/components/ui/SyncIndicator.tsx`, `src/components/ui/OfflineBanner.tsx`.
Seeded hypotheses: initial hydrate pushes merged data back (does a fresh device with empty local state push and wipe anything?); the subscribe pushes on every state change (debounce? rate limit 60/min will 429 a fast toggler; what does the UI show on 429?); `hydrated.current` never resets on sign-out then sign-in as another user; store persisted under one localStorage key shared across Clerk users on the same device; offline toggle then reconnect ordering.

### F. Everything else (one sweep lane, breadth over depth)
Recovery tab (screenshot upload, metric inputs, date selector), Labs tab (marker sheet, goals), Chat sheet, Settings (push setup, connected accounts, Oura OAuth), PWA (`public/sw.js` cache strategy vs new bundle hashes, `manifest.json`, install banner, offline fallback), `src/middleware.ts` public routes vs cron routes, the two dead components (`RecoveryPanel.tsx`, `SettingsSheet.tsx`) for anything still imported by tests. Open each surface live once, read console and network, log anything that errors, 404s, or renders wrong.

### G. Adversarial review (runs after A–F, one Sonnet lane, fresh context)
Give it the draft ledger and the repo. Its job: for every VERIFIED entry, try to falsify it by reading the cited lines. For every area, name one bug class the hunters did not look for. Return CONFIRMED / DOWNGRADE-TO-INFERRED / REJECT per entry with a one-line reason. Fable adjudicates disagreements by reading the cited lines itself, not by re-dispatching.

---

## LEDGER FORMAT

```
## BUG-NN  <one-line title>
Severity: P0 data loss | P1 wrong behaviour user will hit | P2 visual/UX | P3 nit
Area: A–F
Status: VERIFIED (repro | test | trace) or INFERRED
Where: file:line (all relevant sites)
Repro: numbered steps, device/viewport/theme if visual
Expected / Actual:
Root cause: (what the code does and why that's wrong)
Evidence: test file path, screenshot path, or the traced lines quoted
Proposed fix: one paragraph, no code. Note if it touches sync schema or persisted data (needs a migration).
Related: BUG-MM if same root cause
```

Top of the ledger: a summary table (id, severity, area, title, status) and a "Not covered" list. Bottom: INFERRED section, and a "Hypotheses killed" list so the next run does not re-check them.

---

## ORCHESTRATOR RULES

- Tune every lane brief before dispatch: files in scope, hypotheses, proof standard, return format, cap of 25 turns. A lane that returns without file:line citations gets one re-dispatch with the missing citations named, then its output is downgraded to INFERRED.
- Lanes A, C, E can run while B, D, F drive the browser. Do not let two browser lanes mutate the same throwaway account concurrently.
- Fable reads lane reports and the cited lines. Fable does not open the big files end to end.
- After the ledger is written, run `npm test`, `npm run lint`, `npx tsc --noEmit` and paste the tail of each into the ledger's footer. The pre-existing suite must be green.
- Final message to Noel: the summary table, the three bugs most likely to be the ones he has already noticed (habits, timer UI), the P0s if any, and the "Not covered" list. Offer a fix run as a follow-up on Sonnet, ordered by severity, one PR per root cause. Do not start fixing.
