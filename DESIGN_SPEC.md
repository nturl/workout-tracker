# Boundless UI Redesign — Design Spec v1 ("Carbon Green")

Authoritative spec for the 2026-08 full-app restyle. Every component must conform.
Architecture is unchanged: CSS custom properties in `globals.css` (`:root` = light,
`.dark` = dark) mapped into Tailwind theme tokens. **No Tailwind `dark:` variants
anywhere** — theme switching happens only through the CSS variables.

## 1. Color

One brand hue across both themes (previously light=blue, dark=green — unified on green).

| Token | Light | Dark |
|---|---|---|
| `--bg-primary` | `#f7f8fa` | `#000000` |
| `--bg-card` | `#ffffff` | `#141417` |
| `--bg-elevated` | `#eef0f4` | `#1e1e22` |
| `--bg-input` | `#ffffff` | `#1a1a1d` |
| `--text-primary` | `#0b1220` | `#f5f5f5` |
| `--text-secondary` | `#5b6472` | `#a3a3a8` |
| `--text-muted` | `#98a1ae` | `#68686e` |
| `--accent` | `#059669` | `#1ed760` |
| `--accent-light` | `#10b981` | `#2ee56f` |
| `--accent-contrast` (text on accent) | `#ffffff` | `#04210e` |
| `--accent-glow` | `rgba(5,150,105,0.15)` | `rgba(30,215,96,0.18)` |
| `--danger` | `#dc2626` | `#f4635e` |
| `--warning` | `#d97706` | `#f5a623` |

Keep existing: `--border*`, `--card-border`, `--ring-offset`, `--heatmap-*`
(update `--heatmap-fill` light to `5, 150, 105`), `--timer-bg`, `--modal-overlay`,
shadows, `--glass-*`. `--app-bg` light gradient: swap the blue radial tint for
`rgba(5,150,105,0.08)` (keep the violet secondary tint). Dark `--app-bg` unchanged.

Data-viz palette (`lib/colors.ts` DOT_COLORS) is unchanged — categorical, not brand.

## 2. Type

Fonts already loaded: Inter (body, `--font-sans`), Space Grotesk (display, `.font-display`).

| Role | Spec | Usage |
|---|---|---|
| display | 28px/34px, 700, -0.03em, font-display | screen titles, big numbers on landing |
| title | 20px/26px, 700, -0.02em, font-display | card titles, sheet headers |
| heading | 17px/22px, 600, -0.01em | list item titles, sub-headers |
| body | 15px/22px, 400 | default copy |
| label | 13px/16px, 500 | buttons, metadata |
| section | 12px/16px, 600, +0.08em, uppercase, text-secondary | section headers ("DAILY HABITS") |
| caption | 12px/16px, 500, text-muted | timestamps, hints |

Stats/timers/streak numbers: `tabular-nums` (`font-variant-numeric: tabular-nums`),
font-display for the numeral, 600–700 weight.

Section header pattern: `section`-style label left + optional small action button right,
`mb-3`, one per content group. This replaces all current ad-hoc section titles.

## 3. Spacing, radius, elevation

- 4px grid. Screen gutter `px-5` (20px). Card padding `p-4` (16px); hero/summary cards `p-5`.
- Gap between cards in a list: `gap-3` (12px). Gap between sections: `space-y-6` (24px).
- Radius tokens (Tailwind): `rounded-card` = **1.25rem**, `rounded-sheet` = **1.75rem**,
  `rounded-button` = **0.75rem**, pills `rounded-full`.
- Every card: `glass-card rounded-card` (bg + hairline ring + soft shadow via tokens).
  Kill all ad-hoc `border border-*` card styling and hardcoded hex backgrounds.
- Sticky/overlay surfaces (header, bottom nav, sheets): `.glass`.

## 4. Motion

Tokens (add to `:root`): `--dur-fast: 150ms; --dur-base: 250ms; --dur-slow: 400ms;
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);`

CSS utilities (defined once in `globals.css`):
- `.anim-fade-up` — opacity 0→1, translateY(12px)→0, `var(--dur-slow) var(--ease-out-quart) both`
- `.anim-scale-in` — opacity 0→1, scale(0.96)→1, `var(--dur-base) var(--ease-out-quart) both`
- Stagger: parent `.anim-stagger`; children get `animation-delay: calc(var(--stagger-i, 0) * 45ms)`;
  set `style={{ "--stagger-i": i }}` per child.
- `.pressable` — `transition: transform var(--dur-fast); active: scale(0.97)` for all tappable cards/buttons.

**framer-motion policy (perf requirement):**
- KEEP framer ONLY in: `ui/Sheet.tsx`, `chat/ChatSheet.tsx`, `labs/MarkerDetailSheet.tsx`
  (AnimatePresence exit animations / drag). These three migrate to
  `LazyMotion` + `domAnimation` + `m.` components (`import { LazyMotion, domAnimation, m } from "framer-motion"`).
- EVERY other file drops its framer import. Entrance animations → `.anim-fade-up` /
  `.anim-scale-in` (+ stagger). Tap feedback → `.pressable`. Simple presence toggles →
  conditional render + `.anim-fade-up` (no exit animation needed for these).
- The existing global `prefers-reduced-motion` rule covers the CSS utilities — do not add per-component handling.

## 5. Components

- **Button primary**: accent bg, `--accent-contrast` text, `rounded-button`, label type,
  `pressable`, `h-11`. **Secondary**: `bg-surface-elevated`, hairline ring, text-primary.
  **Ghost**: transparent, text-secondary, no ring.
- **Inputs**: `bg-surface-input`, `rounded-button`, `.input-field` focus ring (accent), `h-11`, body type.
- **Progress/rings**: accent fill + `.glow-bar`/`.glow-accent` only on active/complete states.
- **Empty states**: centered, muted icon + caption, no card chrome.

## 6. Invariants (every lane, non-negotiable)

- Preserve ALL logic, props, hooks, store selectors (one-field-per-selector zustand
  convention), aria attributes, roles, visible text strings, and data-testids exactly.
  Presentation-only changes.
- No new dependencies. No `dark:` Tailwind variants (normalize any found).
- Colors only via tokens (Tailwind token classes or `var(--…)`) — no new hardcoded hex
  except in data-viz code already using DOT_COLORS.
- Touch targets ≥44px stays (global CSS enforces).
- `npm run build`, `npm test`, `npm run lint` must stay green.
