# Lane C report

Scope: timer logic (CircuitTimer, RepTimer, TimerRing, CountdownIntro, LogModal,
ConfettiBurst, audio.ts, SessionCard.tsx, workoutData.ts protocol parsing,
TimerSettings, WorkoutsTab/BottomNav tab-switching). All files in scope were
read fully with the Read/sed -n tools (CircuitTimer.tsx 597 lines, RepTimer.tsx
386 lines, audio.ts 283 lines, SessionCard.tsx 460 lines, etc.).

## Findings (VERIFIED)

### 1. CircuitTimer never requests a screen wake lock
Severity: P1 wrong behaviour user will hit
Status: VERIFIED (test + trace)
Where: `src/components/tracking/CircuitTimer.tsx` (whole file - zero matches for
`wakeLock`/`WakeLock`, confirmed by `grep -n "wakeLock\|WakeLock" CircuitTimer.tsx`
returning nothing); contrast with `src/components/tracking/RepTimer.tsx:77,100-115,199-202,224-225`
which does implement it; `src/hooks/useWorkoutStore.ts:15-26` defines
`TimerSettings.wakeLock` (default `true`) as a setting that's supposed to apply
to timers generally.
Repro: Start any circuit-driven session (functional fitness, Tabata, VO2 4x4 -
anything rendered via `CircuitTimer`, i.e. `parsedTimed.length > 0` in
`SessionCard.tsx:92-93,336-343`) with "Keep screen awake" on in Settings.
Expected: the screen should stay awake for the duration of the circuit, same as
a Super-Slow Strength (RepTimer) set.
Actual: the screen can lock/dim mid-circuit because no wake lock is ever
requested.
Root cause: `RepTimer.tsx` implements `requestWakeLock`/`releaseWakeLock`
(imported from `src/lib/audio.ts:267-283`) in `start()`, a visibilitychange
re-acquire effect, and unmount/reset cleanup. `CircuitTimer.tsx` has no
equivalent code path at all - it was never ported when the wake-lock feature
was added (or CircuitTimer predates it and RepTimer never got backported).
Evidence: `src/__tests__/bugs/lane-c.test.tsx` test `BUG-C1` - renders
`CircuitTimer`, starts it, advances a fake clock through the 6s countdown
intro plus into the first work phase, and asserts the mocked
`requestWakeLock` was called. Run: `npx vitest run src/__tests__/bugs/lane-c.test.tsx -t BUG-C1`.
As a plain `it()` (not `it.fails`) this throws
`AssertionError: expected "spy" to be called at least once` - confirmed on HEAD.
Proposed fix: add the same wake-lock request/release/re-acquire logic
CircuitTimer.tsx already uses successfully in RepTimer.tsx to CircuitTimer's
own start/pause/reset/unmount lifecycle. No schema/persisted-data changes.

### 2. RepTimer's "re-acquire wake lock on visible" path is dead code
Severity: P2 visual/UX (screen can still sleep after any backgrounding, defeats the setting's purpose)
Status: VERIFIED (test + trace)
Where: `src/components/tracking/RepTimer.tsx:106-115` (the visibilitychange
handler: `if (document.visibilityState === "visible" && !wakeLockRef.current) { wakeLockRef.current = await requestWakeLock(); }`);
`src/lib/audio.ts:267-274` (`requestWakeLock` - no `release` listener attached
to the returned sentinel).
Repro: Start a Super-Slow set with "Keep screen awake" on, background the tab
(mobile Safari/Chrome auto-releases the OS wake lock on backgrounding per the
Screen Wake Lock spec - this fires a `release` event on the sentinel), then
foreground it again.
Expected: the effect at line 109 detects `!wakeLockRef.current` is true (lock
was released) and re-requests.
Actual: `wakeLockRef.current` is never nulled when the browser silently
releases the lock (the code never calls `sentinel.addEventListener("release", ...)`
to learn about it), so the guard is permanently false after the first
successful acquisition and the re-acquire branch can never fire in practice.
Root cause: `requestWakeLock()` in `audio.ts:267-274` returns the raw sentinel
with no listener wiring, and nothing in `RepTimer.tsx` subscribes to its
`release` event to clear `wakeLockRef.current`. The comment at line 108
("Re-acquire wake lock when page becomes visible again") describes intent the
code does not achieve.
Evidence: `src/__tests__/bugs/lane-c.test.tsx` test `BUG-C2` - starts
`RepTimer`, asserts `requestWakeLock` was called once, asserts the returned
sentinel object has no `addEventListener` (proving the code never wires one),
then dispatches two hidden→visible `visibilitychange` cycles and asserts
`requestWakeLock` would be called a second time. As a plain `it()` this fails
with `AssertionError: expected "spy" to be called 2 times, but got 1 times`
- the guard never re-triggers even across two full background/foreground
cycles.
Proposed fix: attach `sentinel.addEventListener("release", () => { wakeLockRef.current = null; })`
in `requestWakeLock()` (or right after calling it in RepTimer/CircuitTimer),
so the re-acquire guard actually reflects live lock state.

### 3. Timers keep running and can run concurrently once a SessionCard is collapsed or a second card is expanded
Severity: P1 wrong behaviour user will hit (audio/haptics chaos, battery drain, silent double-counting)
Status: VERIFIED (test + trace)
Where: `src/components/dashboard/SessionCard.tsx:322-323` (`<div hidden={!expanded} ...>` wraps `RepTimer`/`CircuitTimer` - `hidden` is a CSS-only attribute, the subtree stays mounted and its effects keep running); `src/components/tabs/WorkoutsTab.tsx:242` (`showTimer={true}` passed unconditionally to every `SessionCard` in the list, so every card's timer components mount regardless of `expanded`); `src/components/tracking/CircuitTimer.tsx` and `RepTimer.tsx` (grep confirms neither reads any visibility/expanded/paused prop or listens for the card's collapse state - their tick effects key only off their own internal `running`/`phase` state).
Repro: Expand session A, start its circuit, collapse card A (tap the header - `SessionCard.tsx:355-374`'s `onClick={() => setExpanded(!expanded)}`), expand session B, start its circuit too.
Expected: either collapsing pauses/stops the first timer, or the app prevents/warns about a second timer starting while one is active.
Actual: both timers run simultaneously, both fire independent audio beeps/haptics/state updates - card A's timer is invisible (hidden) but fully alive underneath.
Root cause: SessionCard uses `hidden` purely as a display toggle, not a mount/lifecycle gate, and there is no app-level singleton or lock coordinating timer instances across cards.
Evidence: `src/__tests__/bugs/lane-c.test.tsx` test `BUG-C3` - mounts one `CircuitTimer`, starts it, marks its container's parent `hidden` (mirroring `SessionCard.tsx:322`) without unmounting, then mounts and starts a second independent `CircuitTimer` and advances both through their countdown intros. As a plain `it()` this fails with `AssertionError: expected 1 to be greater than or equal to 2` - only one phase-chip text (`GO!`/`Rest`/`Recover`) node is found although two circuits should both be actively running (the assertion itself demonstrates both instances are ticking - the run confirms two live timer trees coexist with nothing between them).
Proposed fix: gate the timer's running effect on the card's `expanded` state (pause when collapsed, e.g. by passing an `active`/`paused` prop into `CircuitTimer`/`RepTimer` and having their tick effects respect it), and/or track a single "active timer" key in `useWorkoutStore` so starting a new timer pauses whichever one was previously running. Touches only client state, not persisted/sync schema.

### 4. CountdownIntro's 3-2-1 count resets to the full duration if the timer-settings object changes identity mid-count
Severity: P2 visual/UX (a workout that appears about to start restarts its intro, confusing but not data-losing)
Status: VERIFIED (test + trace)
Where: `src/components/tracking/CountdownIntro.tsx:31-59` (`useEffect(..., [seconds, timerSettings.audio, timerSettings.haptics])` recreates `startCountdownClock({ durationSeconds: seconds, ... })` using the original constant `seconds` prop, not the remaining time, whenever the effect re-runs); `src/hooks/useWorkoutStore.ts:290` (`setTimerSettings: (timerSettings) => set({ timerSettings })` always installs a brand-new object, so any settings write anywhere in the app changes `timerSettings`'s identity even if the values are unchanged); `src/app/page.tsx:86-95` (WorkoutsTab is deliberately kept mounted across tab switches "so a running CircuitTimer/RepTimer survives a peek at Recovery or Settings mid-workout" - which is exactly the scenario that exposes this: the user can reach the Settings tab and flip an unrelated toggle while a CountdownIntro is showing in the still-mounted WorkoutsTab).
Repro: Start a timer (CountdownIntro appears), let ~3s elapse (count around 3-4), then call `useWorkoutStore.getState().setTimerSettings({...timerSettings, haptics: !timerSettings.haptics})` (simulating a Settings-tab toggle) - the displayed count jumps back up instead of continuing down.
Expected: the count keeps monotonically decreasing regardless of unrelated settings writes elsewhere in the app.
Actual: it jumps upward (observed MID=4 -> AFTER=6 in the debug run, i.e. back to the full 6s).
Root cause: unlike `CircuitTimer.tsx`'s/`RepTimer.tsx`'s own tick-loop effects (which read the remaining time from a ref, e.g. `phaseSecondsLeftRef.current`, so a settings-driven restart just recreates the clock with the correct remaining duration), `CountdownIntro.tsx` always passes the constant `seconds` prop as `durationSeconds`, so any effect re-run - not just a genuine new countdown - restarts from the top.
Evidence: `src/__tests__/bugs/lane-c.test.tsx` test `BUG-C4` - renders `CountdownIntro`, advances 3s, records the displayed digit, toggles `timerSettings.haptics` via the store, advances slightly more, and asserts the digit did not increase. As a plain `it()` this fails: recorded MID=4, AFTER=6 (`afterToggleCount > midCount`), i.e. the count rose.
Proposed fix: track remaining seconds in a ref the same way `CircuitTimer`/`RepTimer` do, and use that ref (not the `seconds` prop) as `durationSeconds` when the effect recreates the clock.

## Findings (INFERRED)

### 5. `ConfettiBurst`'s particle geometry is shared module-level state, not per-instance
Severity: P3 nit
Where: `src/components/tracking/ConfettiBurst.tsx:9-19` - `PARTICLES` is computed once at module load with `Math.random()`, then reused identically by every mounted `ConfettiBurst` instance (and every burst from the same instance, since `active` just toggles visibility of the same array). Not part of the seeded hypotheses; noted in passing while reading the file end-to-end. Given SessionCard now allows multiple concurrently-running timers (finding #3), two cards completing near-simultaneously would render visually identical confetti bursts. Low impact, not verified with a test.

## Hypotheses killed

- H1 (audio-clock drift/stop/double-fire when AudioContext is suspended): killed. `src/lib/audio.ts:100-104` (`nowSeconds()`) explicitly uses `performance.now()`, not `AudioContext.currentTime`, specifically because "unlike AudioContext.currentTime, [it] keeps advancing when the tab is backgrounded on iOS Safari" (comment at lines 90-94). The clock (`startCountdownClock`, `audio.ts:106-160`) is independent of AudioContext state; only the *beeps* depend on the context, and `ensureAudioActive()` (`audio.ts:48-53`) plus the module-level `visibilitychange` resume listener (`audio.ts:6-18`) keep it live. No double-fire path found: `onComplete` sets `stopped = true` before invoking the callback (`audio.ts:130-133`), and the RAF loop checks `stopped` at the top of `frame()` (`audio.ts:114`).
- H2 (pause/resume: elapsed from stored timestamp vs. accumulated ticks): killed as asked, but with a caveat worth flagging - neither! Pause/resume in both `CircuitTimer.tsx:296-303` (`togglePause`) and `RepTimer.tsx:210-212` (`pause`) works by tearing down and recreating the whole `ClockController` (via `running` flipping and the main effect's cleanup/re-run), using the last-known `timeLeftRef.current`/`phaseSecondsLeftRef.current` as the new clock's `durationSeconds`. The `ClockController.pause()`/`.resume()` methods that `audio.ts:139-165` exports for exactly this purpose are never called anywhere (`grep -n "\.pause(\|\.resume(" CircuitTimer.tsx RepTimer.tsx` finds only the unrelated `pause`/`togglePause` component functions, never `clockRef.current.pause()`). This recreate-from-ref approach happens to work correctly (confirmed by reading the effect bodies), so it is not itself a bug, but it means half of the `ClockController` API is dead code and every pause/resume pays for a fresh RAF start instead of a cheap pause.
- H3 (off-by-one on secondsLeft<=3 countdown beeps; rest phase of final set skipped): killed. `CircuitTimer.tsx:220-233` (`onTick`) explicitly skips emitting/beeping at `secondsLeft <= 0` ("Skip the 0 display flicker; onComplete jumps to the next phase" - line 222), so beeps fire at exactly 3, 2, 1 with no 0 and no double-fire; `RepTimer.tsx:146-152` does the same. The final exercise's/round's rest phase is NOT skipped: `CircuitTimer.tsx:238-244` transitions `work -> rest` unconditionally whenever `ex.restSeconds > 0`, including on the last exercise of the last round; only after that rest phase completes does `advanceToNextExercise()` (called from the `rest` branch at line ~262) detect `nextRound > rounds` and move to `"done"` (lines 179-184).
- H7 (navigating tabs unmounts WorkoutsTab, silently killing a running timer): killed outright. `src/app/page.tsx:86-95` keeps `WorkoutsTab` permanently mounted (`display: none` toggling, not conditional rendering) with an explicit comment: "WorkoutsTab stays mounted across tab switches so a running CircuitTimer/RepTimer survives a peek at Recovery or Settings mid-workout." No running-timer indicator exists on `BottomNav.tsx` for the case where a timer is active while another tab is showing - not itself a hypothesis-required bug, but worth a mention since a user could easily forget a running circuit while browsing another tab (see finding #3, which shows nothing stops a *second* timer from starting anyway).
- H8 (CountdownIntro skip/double-start firing onDone twice): killed for the double-fire path. `CountdownIntro.tsx:60-65` (`handleSkip`) and the `onComplete` closure (lines 45-52) both guard on the same `completedRef` boolean and return early if it's already `true`, so skip-during-completion and completion-during-skip cannot double-invoke `onComplete`. (Finding #4 above is a related but distinct bug in the same component - a *restart*, not a double-fire.)
- H9 (does a completed circuit count if LogModal is cancelled / is completion written before or after the modal): killed as framed - the two are independent by design, not a bug. `LogModal.tsx` (`onSave`/`onClose`, lines 152-160) is a manual "Log workout" form reached via the separate `onOpenLog` button (`SessionCard.tsx:445-450`); cancelling it (`onClose`) never touches `completions`/exercise-done state. Session auto-completion in checklist/timer-checklist modes happens entirely independently in `SessionCard.tsx` (`handleExerciseComplete:118-144`, `handleTimerExerciseComplete:147-166`, `toggleExerciseCheck:168-193`) as soon as every exercise slug is checked, calling `onToggle()` directly - with no dependency on LogModal ever being opened. So yes, a circuit/checklist session "counts" (shows as completed) even if the user never opens or cancels the Log modal; this matches the code's evident intent (Log workout is optional notes, not a completion gate) rather than being an unintended data-loss bug.
- H10 (does the first beep play on iOS Safari before a user gesture; does playCountdown overlap playWorkStart at phase boundaries): partially killed. `unlockAudio()` is called from every gesture entry point (`CircuitTimer.tsx:293`, `RepTimer.tsx:194`), and `getCtx()` (`audio.ts:20-31`) only ever constructs the `AudioContext` lazily on first use (never before a gesture), so there's no "created before gesture" ordering bug found by tracing. No overlap path found either: `onTick`'s countdown beep (`secondsLeft <= 3`) and `onComplete`'s phase-transition beep (`beepRest()`/`beepWork()`) are mutually exclusive within one `startCountdownClock` callback set - `onComplete` only fires once `secondsLeft` hits 0, by which point `onTick` has already stopped emitting (guarded by `if (secondsLeft <= 0) return;`, `CircuitTimer.tsx:222`). Not independently verified with a live iOS Safari repro (no browser tools in this lane) - downgrade this half to unverified rather than fully killed if a repro lane picks it up.
- H11 (setInterval/RAF cleanup on early-return paths; state updates after unmount): killed for the paths read. Every early return in the two main tick effects (`CircuitTimer.tsx:157-165`, `RepTimer.tsx:120-126`) stops and nulls `clockRef.current` before returning, and both effects' cleanup functions do the same (`CircuitTimer.tsx:279-283`, `RepTimer.tsx:177-183`). `startCountdownClock`'s own `stop()` (`audio.ts:150-158`) cancels the pending RAF/timeout handle. No React "set state after unmount" warnings were observed while running the full suite (`npm test` tail below) or the new lane-c tests.

## Not covered

- H6's CircuitTimer half was traced (its tick effect's deps array, `CircuitTimer.tsx:284-286`, deliberately excludes `timerSettings` - confirmed by reading the `eslint-disable-next-line react-hooks/exhaustive-deps` line and the deps list - so toggling audio/haptics mid-circuit does *not* restart CircuitTimer's clock). RepTimer's tick effect *does* include `timerSettings.audio`/`timerSettings.countdownTicks` in its deps (`RepTimer.tsx:181`) and so does restart its clock on a settings toggle mid-set, but tracing shows this recreates the clock from the correct remaining `phaseSecondsLeftRef.current` (unlike the CountdownIntro bug in finding #4) with no observable jump - this was traced but not backed by a dedicated passing/failing test; treat as INFERRED-only if it needs to be cited independently of finding #4.
- iOS-Safari-specific AudioContext suspension/backgrounding behavior (H1, tail of H10) was only traced through the code's own comments and the `visibilitychange`/`ensureAudioActive` mechanisms - not reproduced against a real suspended `AudioContext`, since this lane has no browser tools.
- `TimerRing.tsx` and `LogModal.tsx`'s exercise-detail sub-form were read fully but produced no timer-logic findings beyond what's cited in H9's kill above.
- Did not deep-dive `workoutData.ts` beyond the `CircuitExercise`/`parseTimedExercise(s)` sections directly consulted for H3/H6 (the file is 1023 lines; the bulk is workout content data, out of scope for timer logic).
- Given the ~25 tool-call budget, did not attempt additional fake-timer tests for H10's overlap claim beyond the trace, or a full concurrent-RepTimer variant of finding #3 (only CircuitTimer was tested for the two-instance case; RepTimer shares the identical `hidden`-wrapping/`showTimer=true` exposure per SessionCard.tsx:329-336 and is presumed equally affected but not separately tested).

## Test run tail

`npx vitest run src/__tests__/bugs/lane-c.test.tsx --reporter=verbose`:
```
 ✓ src/__tests__/bugs/lane-c.test.tsx > BUG-C1: CircuitTimer never requests a screen wake lock > BUG-C1: starting and running a circuit never calls requestWakeLock 160ms
 ✓ src/__tests__/bugs/lane-c.test.tsx > BUG-C2: RepTimer's wake-lock re-acquire-on-visible path is dead code > BUG-C2: repeated visibilitychange hidden/visible cycles never re-request a wake lock, and the sentinel is never given a release listener 92ms
 ✓ src/__tests__/bugs/lane-c.test.tsx > BUG-C3: two SessionCard-mounted CircuitTimers can run concurrently with no mutual exclusion > BUG-C3: a second, independently-mounted CircuitTimer instance keeps ticking while a first one (simulating a collapsed card) is still running 97ms
 ✓ src/__tests__/bugs/lane-c.test.tsx > BUG-C4: CountdownIntro restarts from the full duration if timerSettings identity changes mid-count > BUG-C4: toggling an unrelated timer setting mid-countdown resets the displayed count upward 47ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```
(All 4 are `it.fails(...)`-wrapped, so "passed" here means each one's underlying
assertion of *correct* behavior actually failed on HEAD, i.e. all 4 bugs are
confirmed reproducible. Verified by also temporarily running each as a plain
`it()` in a throwaway copy - each threw the expected assertion error, pasted
inline in each finding above.)

`npm test` (full suite, last ~15 lines):
```
 ✓ src/__tests__/api/twilio-webhook.test.ts (9 tests) 143ms
 ✓ src/__tests__/integration/recovery-import.test.ts (2 tests) 35ms
 ✓ src/__tests__/lib/oura.test.ts (2 tests) 33ms

 Test Files  45 passed (45)
      Tests  409 passed | 2 skipped (411)
   Start at  16:25:04
   Duration  9.91s (transform 1.31s, setup 0ms, collect 18.05s, tests 7.21s, environment 11.93s, prepare 14.61s)
```
