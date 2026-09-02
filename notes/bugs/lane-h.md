# Lane H report

## Findings (VERIFIED)

### 1. `.anim-fade-up`'s held transform turns SessionCard into a containing block, trapping CountdownIntro's `fixed inset-0` overlay inside the accordion instead of the viewport
Severity: P1 wrong behaviour user will hit
Status: VERIFIED (test + trace)
Where:
- `src/app/globals.css:230-239` (`@keyframes fade-up`, ends `transform: translateY(0)`)
- `src/app/globals.css:252-254` (`.anim-fade-up { animation: fade-up var(--dur-slow) var(--ease-out-quart) both; }`)
- `src/components/dashboard/SessionCard.tsx:220` (card root: `glass-card rounded-card overflow-hidden relative anim-fade-up ...`)
- `src/components/dashboard/SessionCard.tsx:324` (expanded wrapper: `` `px-5 pb-5 pt-4 space-y-4 ${expanded ? "anim-fade-up" : ""}` ``)
- `src/components/tracking/CountdownIntro.tsx:77` (`className="fixed inset-0 z-[60] ... bg-black/80 backdrop-blur-md ... anim-fade-up"`)
- `src/components/tracking/CircuitTimer.tsx:412` / `src/components/tracking/RepTimer.tsx:241` (mount `<CountdownIntro>` directly under the accordion content, itself under the card root)

Repro: iPhone, iOS PWA/Safari, ~390pt viewport, light theme, Workouts tab, expand a session that has a timed exercise, tap play to start the 3-2-1 countdown. Screenshot per user report: session card renders as one near-black rounded rectangle ~820pt tall; only faint blurred blobs (a pill near the top third, two small green-tinted smudges lower) are visible; header/rings/week strip/bottom nav render normally.

Expected: `CountdownIntro`'s `position: fixed; inset: 0` should cover the entire viewport (a true full-screen intro), independent of where it's mounted in the DOM.

Actual: it renders confined to — and clipped by — the SessionCard's own box.

Root cause: `position: fixed` is normally positioned relative to the viewport, *unless* an ancestor establishes a new containing block. Per the CSS Transforms spec, any ancestor whose computed `transform` is not `none` becomes that containing block for `fixed`-positioned descendants (this also holds it as a positioned box, independent of the ancestor's own `position` value). `@keyframes fade-up`'s `to` state is `transform: translateY(0)` (globals.css:236-238) — not `transform: none`. Combined with `animation-fill-mode: both` on `.anim-fade-up` (globals.css:253), the browser holds that computed `translateY(0)` transform **forever** after the 400ms animation finishes, not just during it. Both `SessionCard`'s root div (line 220) and its expanded-content wrapper (line 324, applied whenever `expanded` is true — which it is whenever a timer is visible) carry `.anim-fade-up` unconditionally, so both are permanent containing blocks once mounted.

`CountdownIntro` is rendered by `CircuitTimer`/`RepTimer` inside that expanded wrapper (CircuitTimer.tsx:412, RepTimer.tsx:241). Its `fixed inset-0` therefore resolves against the nearest transformed ancestor (the expanded wrapper, or failing that the card root) instead of the viewport: `inset: 0` stretches it to that ancestor's padding box, i.e. the entire expanded accordion — timer + warm-up + instructions + key points + full exercise list + "Log workout" button — which is exactly the ~800pt of stacked content the user photographed. SessionCard's root also has `overflow-hidden` (line 220), so the resulting box is additionally clipped to the card's rounded rectangle. Inside that mis-sized box, `CountdownIntro`'s real content (`bg-black/80 backdrop-blur-md`, huge 10–14rem digit, a blurred ring, "Tap to skip") still renders and the clock still ticks — this is why the user correctly says the countdown is "running but invisible": the `backdrop-blur-md` blurs whatever card content is now trapped behind/around it inside the same clipped box (the phase chip pill and the accent-green play/reset/skip buttons), producing the faint blurred blobs and green-tinted smudges reported, while the giant digit itself is pushed off past the visible, clipped area.

Confirmed as a regression from the V32 redesign: `git show 96b3608 -- src/components/tracking/CountdownIntro.tsx` shows the pre-redesign version used `framer-motion`'s `motion.button` with `initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}` (no `transform` at all) for its own entrance, and `git show 96b3608 -- src/components/dashboard/SessionCard.tsx` shows the redesign is what first added `anim-fade-up` to the SessionCard root (line 220) and expanded wrapper (line 324) in the same commit that converted `CountdownIntro` to plain CSS classes. Before 96b3608, no ancestor of the fixed overlay carried a held `transform`, so the bug did not exist.

Evidence: `src/__tests__/bugs/lane-h.test.tsx`, `BUG-H1` tests, all `it.fails` (i.e. they demonstrate the broken state on HEAD):
1. `fade-up keyframes should end on transform: none` — fails: the `to` keyframe is `translateY(0)`, not `none`.
2. `.anim-fade-up should not hold its final transform forever` — fails: the animation shorthand includes `both`.
3. `CountdownIntro's fixed overlay has no anim-fade-up ancestor between it and <body>` — renders the real `SessionCard` with a timed exercise, expands it, clicks play to mount `CountdownIntro`, and walks the live DOM ancestor chain of the "Skip countdown" overlay — fails: both the expanded wrapper and the card root carry `anim-fade-up`.

Test run:
```
$ npx vitest run src/__tests__/bugs/lane-h.test.tsx
 ✓ src/__tests__/bugs/lane-h.test.tsx (3 tests) 46ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
(all 3 are `it.fails`, so "passed" means each one failed as expected on HEAD, proving the bug.)

Proposed fix: one paragraph, no code. Don't put `.anim-fade-up` (or any class whose keyframes end on a non-`none` transform held by `fill-mode: both/forwards`) on any ancestor of `CountdownIntro`'s `fixed inset-0` overlay — either portal `CountdownIntro` to `document.body` (e.g. via `createPortal`) so its DOM position no longer depends on SessionCard's tree, or strip the entrance transform from `SessionCard`'s root/expanded-wrapper animations (e.g. use a pure-opacity fade for those two specific elements, or apply `.anim-fade-up` only to a non-ancestor inner element instead of the card root/expanded wrapper) so neither remains a containing block once the timer mounts. A portal is the more robust fix since it also protects against any *future* transformed ancestor (e.g. a drag/scale hover effect) breaking the same overlay again. No sync schema or persisted-data changes involved — this is presentation-only.

## Findings (INFERRED)
None.

## Hypotheses killed
- **H1 (as literally seeded)**: "missing @keyframes / animation-fill-mode issue / prefers-reduced-motion strips the animation but leaves the initial hidden opacity-0 state" — false. `@keyframes fade-up` and `@keyframes scale-in` both exist in full (globals.css:230-250), `animation-fill-mode: both` is present and functioning exactly as intended for a fast (`--dur-slow` = 400ms, globals.css:42) entrance fade, and `@media (prefers-reduced-motion: reduce)` (globals.css:120-129) only shortens `animation-duration`/`transition-duration` to `0.01ms` — it does not remove the animation or leave anything at `opacity: 0`. Content is not stuck invisible via a broken opacity animation; it renders fully opaque and correctly colored, just clipped/mis-positioned by a *different* mechanism (containing blocks — see Finding 1). The "faint blurred blobs" are real UI elements seen through `backdrop-blur-md`, not a stuck low-opacity element.
- **H2**: "`--timer-bg` resolves near-black in light theme while text/ring colors also come from light-theme tokens that are dark, giving dark-on-dark" — false. `--timer-bg` is intentionally dark in *both* themes by design (`:root` `--timer-bg: #0f172a` at globals.css:19, `.dark` `--timer-bg: #161619` at globals.css:60 — a deliberate "always-dark timer island," not a theme leak). Crucially, the timer's own text/ring colors are **not** drawn from `--text-primary`/`--text-secondary` (the tokens that flip per theme) — they're hardcoded literals throughout `CircuitTimer.tsx` and `RepTimer.tsx`, e.g. `color: "rgba(255,255,255,0.45)"` (CircuitTimer.tsx:459), `text-white` (CircuitTimer.tsx:482, 495, 503, 516; RepTimer.tsx:274, 280, 306, 319), and `PHASE_COLOR` using `var(--accent)`/`var(--warning)` (CircuitTimer.tsx:25-30) which resolve to bright green/amber in light theme too. So on a correctly-positioned card, white-on-near-black renders with normal contrast in light theme; there is no dark-on-dark text bug.
- **H3 (as literally seeded)**: "card height comes from `min-h-screen`/`h-dvh`/`100vh` on the timer or CountdownIntro wrapper meant for a fullscreen overlay" — false as stated; no such utility class exists anywhere in `CountdownIntro.tsx`, `CircuitTimer.tsx`, or `RepTimer.tsx` (grepped, none present). `CountdownIntro` uses `fixed inset-0` (CountdownIntro.tsx:77), not a viewport-height utility. The oversized box is real, but it comes from `inset: 0` stretching to fill the accordion's *content-driven* height once trapped by the containing-block bug in Finding 1, not from an explicit `100vh`/`min-h-screen` class.
- **H4 (as literally seeded)**: "backdrop-blur overlay that stays mounted after the countdown completes" — false. The clock ticks and `count`/`showGo` state changes normally per the `startCountdownClock` callback (`CountdownIntro.tsx:34-53`); the user's own description ("the countdown is 'working'... it is running but invisible") confirms the overlay is live and updating, not stale/stuck-mounted post-completion. The actual defect is that the (correctly mounted, correctly ticking) overlay is mis-sized/clipped mid-countdown by the containing-block bug in Finding 1 — a positioning bug, not a lifecycle/unmount bug.
- **H5**: "`hidden` attribute on the expanded wrapper causes an animation to fire against a `display:none` element and freeze mid-state" — false. `hidden={!expanded}` (SessionCard.tsx:323) only sets `display:none` when the card is collapsed. The reported state has the card visibly expanded with a timer actively running, so `expanded` is `true` and `hidden` is `false` — the wrapper is not `display:none` at the time of the bug, so no animation is firing against a hidden element.

## Not covered
- Did not reproduce live in an actual iOS Safari/simulator session (no simulator/browser tooling used for this lane; relied on source trace + a structural DOM test, per the proof standard's "VERIFIED (trace)" tier). A real-browser screenshot would additionally nail down the exact pixel box, but the CSS containing-block mechanism is unambiguous from spec + code.
- Did not audit every other `.anim-fade-up`/`.anim-scale-in`/`.anim-stagger` usage sitewide for the same containing-block hazard (e.g. `anim-stagger` rows inside the exercise list at SessionCard.tsx:395, or other cards/sheets elsewhere in the app) — this report only traces the one path that matches the user's screenshot (an active `CountdownIntro` inside an expanded `SessionCard`). Any other `position: fixed`/`position: sticky`-against-viewport element nested under an `.anim-fade-up`/`.anim-scale-in` ancestor anywhere in the app is at risk of the same class of bug and is worth a follow-up sweep.
- Did not check whether Framer-motion's `<Sheet>`/`<ChatSheet>`/`<MarkerDetailSheet>` (still using `AnimatePresence`, per the redesign commit's comment in `src/lib/motion.ts:1-5`) have any similar fixed-descendant nested inside them, since those use `transform` via framer's own inline styles rather than the CSS classes covered here — out of scope for this lane.
- No live-key/credential issues encountered.

## Test run tail
```
$ npm test
...
stderr | src/__tests__/lib/habits.test.ts > ... (unrelated zustand persist warnings, pre-existing/expected in jsdom)

 ✓ src/__tests__/lib/habits.test.ts (31 tests) 11ms
 ✓ src/__tests__/lib/oauthTokens.test.ts (8 tests) 3ms
 ✓ src/__tests__/validators.test.ts (23 tests) 24ms
 ✓ src/__tests__/api/health.test.ts (5 tests) 8ms
 ✓ src/__tests__/integration/hydrate-prefer-true.test.ts (7 tests) 4ms
 ✓ src/__tests__/hooks/merge-habit-defs.test.ts (7 tests) 3ms
 ✓ src/__tests__/lib/oura.test.ts (2 tests) 2ms

 Test Files  46 passed (46)
      Tests  412 passed | 2 skipped (414)
   Start at  18:31:07
   Duration  3.28s (transform 1.86s, setup 0ms, collect 7.57s, tests 2.67s, environment 2.77s, prepare 3.46s)
```
