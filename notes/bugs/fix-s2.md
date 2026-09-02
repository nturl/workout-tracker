# Fix lane S2 (timers) — report

Scope: src/components/tracking/{CircuitTimer,RepTimer,CountdownIntro,TimerRing,ConfettiBurst,LogModal}.tsx,
src/components/dashboard/SessionCard.tsx, src/lib/audio.ts, src/app/globals.css, tailwind.config.js,
src/__tests__/bugs/{lane-c,lane-d,lane-h}.test.tsx, src/__tests__/lib/audio.test.ts.

## BUG-29 (P1) — CountdownIntro trapped inside SessionCard by a held transform

- `src/components/tracking/CountdownIntro.tsx`: the overlay now renders via `createPortal(content, portalTarget)`
  straight to `document.body`, so its `fixed inset-0` is never a descendant of any SessionCard ancestor at all —
  robust against *any* future transformed ancestor, not just `.anim-fade-up`. `portalTarget` is set via a lazy
  `useState(() => typeof document !== "undefined" ? document.body : null)` initializer (SSR-safe, no effect/extra
  render needed).
- `src/app/globals.css`:
  - `@keyframes fade-up`'s `to` block now ends on `transform: none` instead of `transform: translateY(0)` (both
    line 230-239ish). `none` is animatable to/from a translate the same as an explicit identity transform, so the
    visual entrance is unchanged.
  - `.anim-fade-up`'s animation shorthand fill-mode changed from `both` to `backwards` (keeps the pre-animation
    "invisible" state needed by `.anim-stagger` rows' `animation-delay`, but no longer holds the `to` state forever
    after the animation ends — post-animation appearance is unchanged since `to` already matches the plain
    un-animated CSS state).
- Checked every other `fixed` element in the owned files: `LogModal.tsx` has no `fixed` elements of its own (only
  wraps `<Sheet>`, not owned); `ConfettiBurst.tsx` uses `absolute`, not `fixed`, and unmounts itself entirely
  (returns `null`) rather than relying on a held animation state, so it isn't at risk of the same trap.
- Verified: `src/__tests__/bugs/lane-h.test.tsx` — all 3 tests flipped from `it.fails` to `it`. The DOM-ancestor
  test needed `act(async () => { fireEvent.click(playButton); await new Promise(r => setTimeout(r, 0)); })`
  instead of a bare `fireEvent.click` — CircuitTimer's play handler is now async (BUG-06) and the portal's own
  first-render gate needs a tick, both of which need a proper `act` flush (documented inline). The first `it` also
  had its own pre-existing regex bug (see Tests flipped below) fixed alongside the flip.

## BUG-07 (P1) — timers keep running when a card collapses / two timers can run at once

- Added a module-level "active timer" registry to `src/lib/audio.ts`: `claimActiveTimer(token, stopFn)` /
  `releaseActiveTimer(token)`. Whoever claims last force-stops whoever held the slot before.
- `CircuitTimer.tsx` / `RepTimer.tsx`: each instance gets a stable `timerTokenRef = useRef({})`. The play handler
  (`togglePause` / `start`) calls `claimActiveTimer(token, forceStop)` the moment the user presses play (even
  before the countdown finishes) — this force-stops any other timer that was running or mid-countdown. `pause`,
  `reset`, `stopSet`/natural completion, and unmount all call `releaseActiveTimer`.
- Added a new `active?: boolean` prop (default `true`) to both components. `SessionCard.tsx` now passes
  `active={expanded}` to both `<RepTimer>` and `<CircuitTimer>`. When `active` flips to `false`, the component
  resets `running`/`showCountdown` to false — implemented as a render-phase state adjustment (React's documented
  "adjusting state when a prop changes" pattern: compare against a `prevActive` state var during render) rather
  than inside a `useEffect`, because this repo's eslint config (`react-hooks/set-state-in-effect`, error-level)
  rejects a bare `setState` call inside an effect body. The registry release for the same transition stays in a
  plain `useEffect` since `releaseActiveTimer` is a non-React side effect, not a state setter.
- Verified: `src/__tests__/bugs/lane-c.test.tsx`'s `BUG-C3` describe block — rewrote the single original test into
  two (see Tests flipped / rewritten below) and both pass.

## BUG-06 (P1) — CircuitTimer never requests a wake lock

- `CircuitTimer.tsx`: mirrored RepTimer's wake-lock lifecycle — `wakeLockRef`, request on play (before showing the
  countdown), release on unmount/reset, re-acquire-on-visible effect. `togglePause` is now `async` to `await
  requestWakeLock(...)` (matches RepTimer's existing `start()` shape).
- Verified: `src/__tests__/bugs/lane-c.test.tsx` `BUG-C1` flipped `it.fails` → `it`, passes unchanged.

## BUG-16 (P2) — RepTimer's wake-lock re-acquire path was dead code

- `src/lib/audio.ts`: `requestWakeLock(onRelease?: () => void)` now wires `onRelease` to the real sentinel's own
  `'release'` event (`sentinel.addEventListener?.("release", onRelease)`), so a caller's `wakeLockRef` can
  actually be nulled when the OS/browser silently revokes the lock. `WakeLockSentinelLike` gained an optional
  `addEventListener` field.
- `RepTimer.tsx` and `CircuitTimer.tsx` both pass `() => { wakeLockRef.current = null; }` as the callback wherever
  they call `requestWakeLock`.
- Verified: `src/__tests__/bugs/lane-c.test.tsx` `BUG-C2` — flipped and **rewrote** (see below); also added direct
  unit coverage in `src/__tests__/lib/audio.test.ts` (`requestWakeLock wires an onRelease callback...`, `...does
  not throw when the sentinel has no addEventListener`) and a registry test
  (`claimActiveTimer force-stops the previous holder...`).

## BUG-17 (P2) — CountdownIntro restarted from full duration on unrelated settings writes

- `CountdownIntro.tsx`: added a `timerSettingsRef` synced via its own effect; the clock-setup effect now reads
  `timerSettingsRef.current.audio`/`.haptics` instead of closing over `timerSettings` directly, and its dependency
  array is just `[seconds]` (was `[seconds, timerSettings.audio, timerSettings.haptics]`). An unrelated
  `setTimerSettings` write elsewhere no longer tears down/recreates the clock mid-count.
- Verified: `src/__tests__/bugs/lane-c.test.tsx` `BUG-C4` flipped `it.fails` → `it`, passes unchanged.

## BUG-18 (P2) — ticking digits used font-display, contradicting the app's own tabular-nums policy

- Removed `font-display` from the numeral elements while leaving it on phase-label text (`UP`/`DOWN`/`GO!`):
  - `CountdownIntro.tsx:92`-ish (the 3-2-1/GO digit — ticking)
  - `RepTimer.tsx` phase countdown digit (was line ~306 — ticking) and the idle "N reps" static display (was
    line ~280)
  - `CircuitTimer.tsx` phase countdown digit (was lines ~516-517 — ticking) and the idle total-time static display
    (was line ~482)
- Verified: `src/__tests__/bugs/lane-d.test.tsx` `BUG-D1a` flipped `it.fails` → `it`; needed the same async-click
  `act` fix as lane-h (see Tests flipped below).

## BUG-24 (P3) — `var(--timer-bg, #1a1a2e)` fallback matched neither theme

- `CircuitTimer.tsx` and `RepTimer.tsx`: `style={{ background: "var(--timer-bg)" }}` — dropped the `#1a1a2e`
  fallback. `--timer-bg` is already defined in both theme blocks in `globals.css` (`#0f172a` light / `#161619`
  dark, lines 19 and 60), so no `globals.css` change was needed for this one, only removing the mismatched
  fallback at the two call sites.
- Not DOM-testable (happy-dom serializes computed style, not the literal `var(...)` source text) — the existing
  `lane-d.test.tsx` `BUG-D3` describe kept as `it.skip` with its comment updated to reflect the fix, since it was
  never a `it.fails` in the first place.

## BUG-23 (P3, timer files only) — hardcoded colors bypass the token system

- `ConfettiBurst.tsx`: swapped the standalone hex `COLORS` array for `var(--accent)` / `var(--warning)` /
  `var(--danger)` plus three existing `DOT_COLORS` entries (`strength`, `meditation`, `posture` — imported
  read-only from `src/lib/colors.ts`), matching the proposed fix in the bug report exactly.
- `TimerRing.tsx`'s track color (`rgba(255,255,255,0.08)`) and the many `rgba(255,255,255,...)` literals still
  inside `CircuitTimer.tsx`/`RepTimer.tsx` were **left as-is**: there is no existing design token for "chrome
  color on an always-dark surface regardless of the active theme" — `var(--text-primary)` etc. flip with the
  theme, but `--timer-bg` is intentionally dark in both themes (that's BUG-24's finding), so using a theme token
  there would break contrast in light mode. Re-tokenizing this properly means introducing new theme-invariant
  "on-dark-chrome" tokens, which is a real design-system decision beyond a surgical P3 diff — flagging it rather
  than guessing at new token names.

## Tests flipped / rewritten

- `src/__tests__/bugs/lane-c.test.tsx`: `BUG-C1`, `BUG-C4` flipped as-is (unchanged assertions, now pass).
  - `BUG-C2`: flipped **and rewrote**. The original test only toggled `document.visibilityState` and asserted the
    sentinel's `addEventListener` stayed `undefined` — but the Wake Lock API doesn't fire `'release'` from a
    visibilitychange toggle, it fires `'release'` on the sentinel itself when the OS/browser revokes the lock. That
    meant the original test could never have exercised the real fix. Rewrote the shared `requestWakeLockMock` to
    accept the `onRelease` callback and expose it as `sentinel.__fireRelease()`, then simulate two real
    OS-revocation cycles directly.
  - `BUG-C3`: flipped **and split into two tests**. The original test waited for two independently-mounted
    `CircuitTimer`s' own 6s `CountdownIntro` clocks to both converge under one shared fake-timer/rAF environment,
    then compared rendered phase-chip text (`getAllByText(/^(GO!|Rest|Recover)$/).length >= 2`). That convergence
    turned out not to be reliably reachable for a second, concurrently-mounted instance under this repo's
    fake-timer setup (confirmed via isolated repro — even a *solo* second render alone got stuck, unrelated to any
    mutual-exclusion logic) — a test-harness limitation, not a fact about app behavior either way. Replaced with
    two deterministic tests against the actual mutual-exclusion mechanism: (1) starting timer B immediately flips
    timer A's play/pause button back to "Start timer" with no time needing to pass, and (2) flipping `active` to
    `false` (simulating SessionCard collapse) does the same. Both also needed clicks wrapped in
    `await act(async () => { btn.click(); })` instead of a bare sync `act(() => btn.click())` — CircuitTimer's play
    handler is async (awaits `requestWakeLock` before doing anything else), and leaving that continuation
    unresolved outside an `act`/fake-timer flush boundary was found to completely stall the nested
    `CountdownIntro`'s rAF-driven clock under `vi.useFakeTimers()` (reproduced in isolation with a trivial
    unrelated wrapper component — this is a generic vitest/testing-library pattern issue, not specific to
    CircuitTimer/RepTimer). Also bumped the countdown-clearing advance from 6000ms to 6500ms — `CountdownIntro`
    has a 350ms "GO" flash delay before firing `onComplete` that the original 6000ms didn't budget for.
- `src/__tests__/bugs/lane-d.test.tsx`: `BUG-D1a` flipped and given the same async-click `act` fix as above (same
  root cause — `RepTimer.start()` is async). `BUG-D3`'s `it.skip` comment updated to note the fix, left skipped
  (not DOM-testable, as already documented there).
- `src/__tests__/bugs/lane-h.test.tsx`: all 3 flipped. The CSS-fact test's own regex had a pre-existing,
  independent bug — the outer lazy `[\s\S]*?}\s*}` match's capture group excludes the very `}\s*}` it matches
  against, which is the `to` block's own closing brace, so the inner `to\s*{([^}]*)}` search could never find a
  match, on HEAD or after the fix. As `it.fails` this went unnoticed (failed for the wrong reason — a missing `to`
  block — never reaching the real transform-value assertion). Rewrote it to capture `from`/`to` in one pass. The
  DOM-ancestor test needed the `act` fix described under BUG-29 above.
- `src/__tests__/lib/audio.test.ts`: added 3 new tests (release-listener wiring, graceful no-`addEventListener`
  handling, and the active-timer registry's claim/release/force-stop semantics). All existing tests in this file
  were untouched and still pass.

## Not fixed / flagged

- The broad `rgba(255,255,255,...)` literals throughout `CircuitTimer.tsx`/`RepTimer.tsx` and `TimerRing.tsx`'s
  track color (part of BUG-23) — left as-is, reason given above (no existing theme-invariant "on-dark-chrome"
  token; introducing one is a design-system decision, not a surgical fix).
- `WorkoutsTab.tsx` — not touched (owned by another lane). No change was needed there for any of these bugs:
  `showTimer={true}` is unconditional as before, but BUG-07 is now fully handled inside `SessionCard`/`RepTimer`/
  `CircuitTimer` via the new `active` prop and the `audio.ts` registry, so nothing about `WorkoutsTab.tsx` needs to
  change for this fix.

## Verification

`npx vitest run` — 51 test files, 462 passed, 2 skipped (both pre-existing intentional skips in `lane-d.test.tsx`
for browser-only/non-DOM-testable findings), 0 failed:

```
 Test Files  51 passed (51)
      Tests  462 passed | 2 skipped (464)
```

`npx tsc --noEmit` — no output, 0 errors.

`npx eslint <owned files>` — 0 errors. 2 pre-existing warnings in `lane-d.test.tsx` (unused `beforeEach`/
`afterEach` imports, present before this fix, not touched) and 2 `react-hooks/exhaustive-deps` warnings on the
`timerTokenRef.current` cleanup pattern were resolved by copying the ref to a local `const token` inside the
effect per the lint's own suggested fix.
