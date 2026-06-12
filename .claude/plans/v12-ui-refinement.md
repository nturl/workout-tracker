# V12 - UI Refinement

Theme: Elevate the visual design from "clean and functional" to "polished and delightful" without losing restraint.

## Current State

The app has strong bones: semantic CSS variables, dark/light mode, Inter font, responsive layout, 69.3 KB bundle. But it reads flat - glass morphism is defined but unused, shadows are minimal, animations are inconsistent, and the typography hierarchy is compressed. The design language says "MVP" when the code quality says "production."

---

## P1 - Depth and Light

### 1. Shadow depth system
**globals.css** - Replace the two-level shadow system with a proper elevation scale:
- `--shadow-xs`: 1px subtle lift for badges/pills
- `--shadow-sm`: Cards at rest (current card-shadow)
- `--shadow-md`: Cards on hover, floating elements
- `--shadow-lg`: Modals, sheets
- Dark mode: Use inset border glow instead of box-shadow (dark surfaces don't cast shadows)

### 2. Activate glass morphism
**Header (sticky)** already uses `.glass` - good. Apply it to:
- **Sheet.tsx** modal content panel (the content div, not overlay)
- **RecoveryBanner.tsx** - glass card instead of flat bg-card
- **SunBanner.tsx** - glass card for the sunrise/sunset strip

### 3. Accent glow on active states
- Progress bar: Apply `.glow-bar` class (already defined, never used)
- Completed SessionCard checkmark: Subtle accent glow ring
- StreakCounter rings: Add glow when streak > 0

---

## P2 - Motion Consistency

### 4. Standardize animation spring config
Create shared constants in a new `src/lib/motion.ts`:
```ts
export const spring = { type: "spring", damping: 30, stiffness: 300 };
export const springSnappy = { type: "spring", damping: 25, stiffness: 400 };
export const fade = { duration: 0.2 };
```
Apply across: Sheet.tsx, ChatSheet.tsx, SessionCard.tsx, LandingPage.tsx.

### 5. Staggered session cards
SessionCard list currently animates all at once. Add staggerChildren (0.06s) to the parent container for a cascading entrance when switching days.

### 6. Skeleton shimmer
**Skeleton.tsx** - Replace `animate-pulse` with the shimmer keyframe already defined in tailwind.config but never used. Shimmer > pulse for perceived speed.

---

## P3 - Typography Refinement

### 7. Type scale cleanup
The current scale jumps from 11px labels straight to 14px body. Introduce a more intentional hierarchy:
- Section headers: `text-[13px] font-semibold tracking-wide` (replace `text-[11px] font-bold uppercase tracking-wider` - less shouty)
- Body text: Promote key text-xs to text-sm where readability matters (SunBanner times, RecoveryBanner metrics)
- Hero day name: Keep `text-2xl font-black` but add subtle letter-spacing

### 8. Number display polish
Metric numbers in StreakCounter and RecoveryPanel deserve special treatment:
- Use tabular-nums for alignment (`font-variant-numeric: tabular-nums`)
- Slightly larger size for the primary metric (streak count, recovery score)

---

## P4 - Component-Level Polish

### 9. SessionCard completion state
Currently just changes title color. Add:
- Subtle background tint: `bg-accent/5` when completed
- Checkmark button: Scale up slightly (1.05) with accent glow
- Top gradient bar: Full opacity when completed (currently dims)

### 10. Heatmap refinement
- Today's cell: Replace ring-2 with a subtle accent glow (matches P1 glow system)
- Completed cells: Slightly larger border-radius (rounded-sm -> rounded)
- Add a subtle entrance animation when scrolling into view

### 11. Progress bar upgrade
- Apply glow-bar class to the filled portion
- Add a tiny dot indicator at the leading edge (like a playback head)
- 100% state: Pulsing glow celebration

### 12. Landing page refresh
The landing page uses static dark backgrounds. Modernize:
- Subtle gradient background (dark navy to black)
- Feature cards: Glass morphism with border glow on hover
- Hero text: Gradient text treatment on the app name
- Keep it simple - no parallax, no heavy animation

---

## Not Doing
- Icon library swap (Lucide etc) - emoji is part of the personality
- Custom fonts beyond Inter - Inter is excellent, just needs better sizing
- Heavy animation/parallax - restraint is taste
- Theme color changes - the blue/green accent system works

---

## Test Plan
- All 197 existing tests must pass (motion constants are non-visual, won't break)
- Visual verification via preview on both light and dark mode
- Mobile viewport check (375px width)
- Build must compile, bundle should stay under 75 KB

## Target
- Bundle: Stay under 75 KB (motion.ts is tiny, CSS changes are free)
- No new dependencies
- Every change should feel like "that was always there" - not "look what I added"
