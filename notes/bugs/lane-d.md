# Lane D report

Scope: Timer UI/layout + design-system contract, by code reading (no browser tools used).

## Findings (VERIFIED)

### 1. Ticking countdown digits use font-display (Space Grotesk), which the codebase itself documents as lacking tabular figures — digits will jiggle in width every second
Severity: P2 visual/UX
Status: VERIFIED (test + trace)
Where:
- `src/app/layout.tsx:9-11` — the authoritative comment: "Display face for headings, wordmark, and phase labels. Numerals stay Inter (tabular-nums) - Space Grotesk has no tabular figures, so countdowns would jiggle."
- `src/components/tracking/RepTimer.tsx:306` — `className="font-display font-bold tabular-nums text-white"` wrapping `{phaseSecondsLeft}`, re-rendered every second by the audio-clock tick loop (`RepTimer.tsx:148`, `onTick`).
- `src/components/tracking/CircuitTimer.tsx:516-517` — same pattern for `{formatTime(timeLeft)}`, ticking every second via `CircuitTimer.tsx:230`.
- `src/components/tracking/CountdownIntro.tsx:91-92` — `font-display font-bold tabular-nums leading-none` wrapping the 6→1 count, ticking every second via `CountdownIntro.tsx:38`.
- Idle/static instances of the same pattern (`CircuitTimer.tsx:482`, `RepTimer.tsx:280`) are lower severity since they don't re-render per tick, but are still off-policy.
- Contrast with the rest of the app: every other `tabular-nums` usage (`MarkerTable.tsx`, `WeekRhythm.tsx`, `Heatmap.tsx`, `MetricInputs.tsx`, `RecoveryHistory.tsx`, `RecoveryBanner.tsx`, `SunBanner.tsx`, `LogModal.tsx`) stays on the default Inter body font and never combines with `font-display` — confirming this is a real deviation, not an intentional exception.
Repro: numbered steps (device/viewport/theme if visual)
1. Open the app, start any Rep Timer (Super-Slow protocol) or Circuit Timer.
2. Watch the big countdown number during the "up"/"down" (RepTimer) or "work"/"rest" (CircuitTimer) phase, or the 6-1 intro overlay before either starts.
3. Because `tabular-nums` is applied to a `font-display` (Space Grotesk) element, and Space Grotesk (per the app's own documented reasoning) does not expose tabular figures, digit widths are not fixed — narrower digits (1) vs wider digits (0, 8) shift the number's horizontal position/center every second.
Expected / Actual: Expected — countdown digits render in Inter so `tabular-nums` actually fixes each digit's advance width and the number holds its horizontal position. Actual — the countdown numbers use `font-display`, so `tabular-nums` is present in the class list but (per the codebase's own stated font limitation) does not produce fixed-width digits, and the numeral visibly shifts tick to tick.
Root cause: Someone applied the `font-display` typographic system (correct for phase labels like "UP"/"DOWN"/"GO!") to the numeral elements as well, not just the labels, contradicting the font-selection rule laid out for numerals in `layout.tsx`.
Evidence: `src/__tests__/bugs/lane-d.test.tsx` — test `BUG-D1a: RepTimer's live countdown number does not carry font-display`, wrapped in `it.fails` (fails on HEAD because the element's className does contain `font-display`). Run output:
```
✓ src/__tests__/bugs/lane-d.test.tsx (3 tests | 2 skipped) 30ms
```
(the `it.fails` wrapper reports the file as passing overall since the assertion inside correctly fails against HEAD; unwrap the `it.fails` to see the raw failure.)
Proposed fix: Drop `font-display` from the four ticking numeral elements (`RepTimer.tsx:306`, `CircuitTimer.tsx:516`, `CountdownIntro.tsx:91`) and the two static ones (`CircuitTimer.tsx:482`, `RepTimer.tsx:280`), letting them fall back to the Inter body font per `layout.tsx`'s documented rule, while leaving `font-display` on the surrounding phase-label/status text (`UP`/`DOWN`/`Circuit complete`/etc.) untouched. Presentation-only, no schema/logic impact.
Browser check: Open a Rep Timer, start a set, screenshot the phase countdown number across at least 3 different digits (e.g. while it reads "10", "8", "1") at the same zoom/crop to compare horizontal alignment/width; repeat for CircuitTimer's `work`/`rest` countdown and for the CountdownIntro 6→1 overlay.

### 2. `CircuitTimer`/`RepTimer` cards hardcode white/black-alpha colors on a card whose background is a token, without a dark/light exception in DESIGN_SPEC
Severity: P3 nit
Status: VERIFIED (trace)
Where: `src/components/tracking/CircuitTimer.tsx` (e.g. lines 39, 434, 443, 459, 465-467, 479, 485, 496, 508, 510, 522, 526, 530, 542, 551, 565, 578) and `src/components/tracking/RepTimer.tsx` (e.g. lines 258-259, 264, 291, 309, 320, 339-342, 355, 365, 368) use literal `rgba(255,255,255,…)`/`rgba(0,0,0,…)` values instead of `var(--text-primary)`/`var(--text-secondary)`/token classes.
Repro: n/a — source-level only.
Expected / Actual: Expected — per `DESIGN_SPEC.md` §6, "Colors only via tokens … no new hardcoded hex except in data-viz code already using DOT_COLORS." Actual — dozens of literal white-alpha values are used throughout both timer components.
Root cause: `--timer-bg` (`globals.css:19,60`) is intentionally near-black in *both* themes (`#0f172a` light / `#161619` dark), so hardcoding white text/track colors happens to look correct in both themes today — but it's still off-token, and if `--timer-bg` is ever revisited for the light theme (a lighter surface), the hardcoded whites become invisible-on-white without anyone touching this file.
Evidence: direct quotes above; not test-covered because DESIGN_SPEC's "no hardcoded hex" rule isn't itself a runtime-testable invariant with the existing render (colors resolve identically either way today).
Proposed fix: Replace the ad-hoc `rgba(255,255,255,x)` alphas with a small set of new tokens (or reuse `--text-primary`/`--text-secondary`/`--text-muted` with `color-mix` for the alpha steps) scoped to the always-dark timer surface, so a future `--timer-bg` change doesn't silently break contrast.
Browser check: Not independently visible today (informational/spec-compliance finding only) since both themes currently resolve to a dark `--timer-bg`; no screenshot will show a difference under current tokens.

### 3. `var(--timer-bg, #1a1a2e)` fallback hex matches neither theme's actual `--timer-bg` value
Severity: P3 nit
Status: VERIFIED (trace)
Where: `src/components/tracking/CircuitTimer.tsx:411`, `src/components/tracking/RepTimer.tsx:240` — both use `style={{ background: "var(--timer-bg, #1a1a2e)" }}`. `src/app/globals.css:19` defines `--timer-bg: #0f172a` (light/`:root`) and `globals.css:60` defines `--timer-bg: #161619` (`.dark`).
Repro: n/a — the fallback never fires in normal app usage since `--timer-bg` is always defined at `:root`/`.dark`.
Expected / Actual: Expected — no bespoke third color; if a fallback is kept at all it should match one of the two token values. Actual — `#1a1a2e` is a third, off-token dark-navy that matches neither `#0f172a` nor `#161619`.
Root cause: Leftover fallback value from before the redesign (or copy-pasted) never reconciled against the final `--timer-bg` values landed in `globals.css` by the same 96b3608 redesign commit.
Evidence: direct quotes above (`git show 96b3608 -- src/components/tracking/CircuitTimer.tsx` confirms both this file and `globals.css`'s `--timer-bg` entries were touched in the same commit, yet left inconsistent).
Proposed fix: Drop the `#1a1a2e` fallback entirely (`var(--timer-bg)`) or, if a defensive fallback is wanted for safety, set it to match `--timer-bg`'s dark value (`#161619`) so a resolution failure degrades to an on-brand color instead of an arbitrary third one.
Browser check: Not visually reproducible under current CSS (the var always resolves); would only show if `--timer-bg` were ever unset for a subtree, which does not happen today.

### 4. `ConfettiBurst` particle colors are hardcoded hex, not design tokens
Severity: P3 nit
Status: VERIFIED (trace)
Where: `src/components/tracking/ConfettiBurst.tsx:5` — `const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];`
Repro: n/a — source-level.
Expected / Actual: Expected — per `DESIGN_SPEC.md` §6, hardcoded hex is only allowed "in data-viz code already using DOT_COLORS" (`src/lib/colors.ts`). Actual — `ConfettiBurst` is celebratory UI chrome, not data-viz, and defines its own separate hex palette rather than reusing `DOT_COLORS` or accent/warning/danger tokens.
Root cause: Confetti was treated as decorative rather than themed UI when the component was rewritten in the 96b3608 redesign (it is in that commit's diff stat).
Evidence: quoted line above.
Proposed fix: Either fold this into the spec's data-viz exception explicitly (since particle color, unlike text/background, arguably behaves like decorative data-viz) or swap the six literals for `var(--accent)`, `var(--accent-light)`, `var(--warning)`, `var(--danger)` plus 1-2 of the existing `DOT_COLORS` entries so it draws from the same palette as the rest of the app.
Browser check: Trigger a circuit/set completion (whatever flow renders `<ConfettiBurst active />`) in both light and dark theme; screenshot to confirm the burst colors don't clash with the active theme's accent hue (currently `#22c55e`/`#10b981`-family green is close to `--accent` but not identical, and the other five are unrelated to any token).

## Findings (INFERRED)

### 5. `.pressable:active` may leave the pressed (scaled-down) look stuck after a touch, with no `touch-action` mitigation
Severity: P3 nit
Where: `src/app/globals.css:264-270` — `.pressable { transition: transform var(--dur-fast); } .pressable:active { transform: scale(0.97); }`. No `touch-action` declared anywhere in the CSS (`grep -rn touch-action` returns nothing in `src/`), and no `pointer-events`/`:active` release safeguard (e.g. resetting on `touchend`/`touchcancel`) is present.
Why inferred not verified: this is a well-known mobile-Safari class of bug (`:active` state can persist after a scroll-initiated touch or a fast tap because the OS doesn't always fire a clean `mouseup`/`mouseleave` on touch), but confirming it actually reproduces on this app's buttons requires a real touch device or a mobile browser session, which is outside this lane (no browser tools). Left for the browser lane.
Browser check: On an iOS/Android device (or Chrome DevTools touch emulation with an actual touch/tap, not a mouse click), tap-and-hold-then-drag-away off a `.pressable` timer control (play/pause/reset/skip) and check whether the `scale(0.97)` pressed look remains stuck after releasing the finger away from the button.

### 6. Phase chip text-on-tint contrast for `idle`/`--text-muted` may be low
Severity: P3 nit
Where: `src/components/tracking/CircuitTimer.tsx:453-458` / `RepTimer.tsx:255-263` — the phase chip's `color` is set directly to `phaseColor` (`PHASE_COLOR.idle = "var(--text-muted)"`) over a `color-mix(in srgb, var(--text-muted) 15%, transparent)` background, itself sitting on the near-black `--timer-bg`. `--text-muted` is `#98a1ae` (light) / `#68686e` (dark) — deliberately low-contrast/muted by design, so this may be intentional for the "Ready"/idle state (a de-emphasized label) rather than a bug.
Why inferred not verified: contrast ratio against the actual composited background (timer-bg + 15% muted tint) wasn't computed; needs a real render/color-picker check to say whether it dips below WCAG AA for 11px bold uppercase text.
Browser check: Screenshot the idle CircuitTimer/RepTimer phase chip ("Ready"/"Super-Slow") in both themes and run a contrast checker against the composited pixel color.

## Hypotheses killed

- H: TimerRing's `key={cycleKey}` on the progress `<circle>` causes an animation re-mount every second (per-tick), which would visibly reset the glow/transition each tick. **False.** `cycleKey` in `CircuitTimer.tsx:475` is `` `${currentRound}-${currentEx}-${innerRound}-${phase}` `` and in `RepTimer.tsx:271` is `` `${currentRep}-${phase}` `` — neither includes the per-second `timeLeft`/`phaseSecondsLeft` value, so the key only changes on phase/segment boundaries, exactly as the in-code comment at `TimerRing.tsx:13-14` describes. Confirmed by reading the tick handlers (`CircuitTimer.tsx:220-276`, `RepTimer.tsx:134-177`): `setTimeLeft`/`setPhaseSecondsLeft` are called every tick without touching `phase`/`currentEx`/`currentRound`/`innerRound`/`currentRep`.
- H: `outline-none` on LogModal's inputs (`LogModal.tsx:89,97,122,128,134`) removes focus indication with no replacement, failing keyboard-accessibility. **False.** `globals.css:178-182` defines `.input-field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }`, and every one of those inputs/textareas carries the `input-field` class, so the browser default is intentionally swapped for a themed focus ring rather than removed. Comment at `globals.css:178` confirms this is deliberate ("inline styles can't express :focus").
- H: Pages under `BottomNav` don't reserve bottom padding for the fixed nav, so content is clipped/hidden behind it. **False.** `WorkoutsTab.tsx:201`, `LabsTab.tsx:40`, `RecoveryTab.tsx:90`, `SettingsTab.tsx:36` all wrap their content in `pb-24` (96px), which comfortably clears the nav's `h-14` (56px) + `env(safe-area-inset-bottom)`. The floating chat button (`page.tsx:124`) independently offsets itself by `calc(4.5rem + env(safe-area-inset-bottom, 0px))` to sit above the nav, consistent with this.
- H: `<body>`'s own `paddingBottom: env(safe-area-inset-bottom)` (`layout.tsx:46`) is meant to clear the fixed BottomNav and is insufficient (only ~34px vs. the nav's ~56-90px). **True as stated, but not a live bug** — it doesn't need to clear the nav, because each individual tab already adds its own `pb-24` (see previous point). Downgraded from a hypothesis to a non-finding; body's safe-area padding is only relevant to non-nav surfaces (there don't appear to be any, since `<main>` fills the viewport under `ClerkProvider`).
- H: Ring stroke math (`TimerRing.tsx:22-26`) has an off-by-one/wrong-direction bug (e.g., circumference computed from the wrong radius, or offset direction inverted so the ring empties instead of fills). **False.** `radius = (size - strokeWidth) / 2` correctly accounts for stroke centering; `circumference = 2πr`; `offset = circumference * (1 - clamped/100)` is standard SVG dasharray/dashoffset progress-ring math (offset = full circumference at pct=0 → nothing drawn; offset = 0 at pct=100 → full circle drawn), matching the documented "elapsed percentage" semantics in the `pct` prop comment (`TimerRing.tsx:8`) and matching how callers compute `phasePct`/`phasePct` as an elapsed fraction (`CircuitTimer.tsx:355-357`, `RepTimer.tsx:235-237`).
- H: The `key={displayValue}` remount in `CountdownIntro.tsx:80` (a scale-in animation replaying every second) is an unwanted per-tick re-animation bug. **False.** The comment directly above it (`CountdownIntro.tsx:79`) states this is intentional: "each digit swap replays the scale-in animation," and it's a distinct, deliberate 6→1→GO intro overlay, not a countdown ring/number in continuous use — replaying a brief scale-in each second is the intended countdown-intro effect, not an artifact of an unrelated state change forcing a remount.
- H: `color-mix()` calls (`TimerRing.tsx:49`, `CircuitTimer.tsx:418,455,578`, `RepTimer.tsx:247,258,301,368`, `CountdownIntro.tsx:96`, `LogModal.tsx:66`) have no fallback and would break rendering entirely on a browser without `color-mix` support. **Not a distinct bug from the rest of the app** — `color-mix()` is used pervasively across the whole redesign (not just these files; e.g. `globals.css` doesn't define any non-`color-mix` fallback path either), so this is a pre-existing, app-wide product decision (modern-browser baseline) rather than something specific to the timer/design-system files in this lane's scope. Not flagging as a lane-D-specific finding.

## Not covered

- No live/browser verification was performed for any finding (out of scope for this lane; flagged "Browser check" steps for the browser lane on each visual finding).
- Did not fully audit `Icon.tsx` (referenced by all timer buttons) for size/stroke consistency — assumed correct based on consistent call sites.
- Did not check color-contrast math (WCAG ratios) numerically for any phase-chip/label combination beyond the idle case noted in finding 6 — would need a color-contrast tool against actual composited pixels.
- Did not trace `startCountdownClock`/`lib/audio.ts` clock-drift internals — out of this lane's scope (Timer UI/layout + design-system contract only, not the audio-clock engine).
- Did not review `SessionCard.tsx` end-to-end beyond its RepTimer/CircuitTimer wiring (it's 460 lines and mostly non-timer dashboard logic outside this lane's stated scope).

## Test run tail

```
 Test Files  40 passed (40)
      Tests  384 passed | 2 skipped (386)
   Start at  16:19:38
   Duration  3.15s (transform 1.54s, setup 0ms, collect 6.60s, tests 2.04s, environment 1.23s, prepare 4.29s)
```
