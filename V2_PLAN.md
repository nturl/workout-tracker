# V2 Plan: Boundless Workout Tracker

**Vision:** A sleek, clever, elegant fitness platform that feels native on mobile and polished on desktop. Built as a PWA with offline-first architecture, real-time sync, and a design system that makes tracking workouts feel effortless.

**Approach:** Build on V1 codebase. Refactor, don't rewrite. Keep what works (workout data model, Clerk auth, Redis persistence, Twilio SMS), restructure everything else.

---

## Design Principles

1. **Mobile-first, desktop-gorgeous** — Primary use is phone in the gym. Desktop is the planning view.
2. **Zero friction** — One tap to complete. Swipe to log. No unnecessary screens.
3. **Calm UI** — Muted palette, generous whitespace, smooth animations. No visual clutter.
4. **Offline-confident** — Works without signal. Syncs silently when reconnected.
5. **Smart defaults** — The app should know what you're doing today without you telling it.

---

## Phase 1: Architecture Foundation

### 1.1 Decompose the Monolith
Break `page.tsx` (1273 lines) into focused components:

```
src/
  app/
    (app)/                    # Authenticated app group
      layout.tsx              # Auth boundary + nav shell
      page.tsx                # Dashboard (renders components)
    (marketing)/              # Public pages
      page.tsx                # Landing page
    api/                      # Keep existing routes
    sign-in/
    sign-up/
  components/
    layout/
      Header.tsx              # Logo, user button, settings trigger
      BottomNav.tsx           # Mobile tab bar (Today, Week, Progress, Recovery)
    dashboard/
      DayView.tsx             # Today's sessions list
      SessionCard.tsx         # Individual workout card
      DayProgress.tsx         # Day completion ring/bar
    tracking/
      LogModal.tsx            # Workout logging sheet
      CompletionToggle.tsx    # Animated checkbox
      ConfettiBurst.tsx       # Celebration animation
    progress/
      StreakCounter.tsx        # Current + best streak
      WeekRhythm.tsx          # 7-day overview
      Heatmap.tsx             # Consistency heatmap
      WeeklySummary.tsx       # Sessions completed, time logged
    recovery/
      RecoveryPanel.tsx       # Refactored from current
      RecoveryBanner.tsx      # Inline recovery status
      MetricCard.tsx          # Individual metric display
      ScreenshotScanner.tsx   # Upload + AI extraction
    settings/
      SettingsSheet.tsx       # Bottom sheet settings
      LevelSelector.tsx
      NotificationConfig.tsx
      SMSConfig.tsx
    ui/
      Sheet.tsx               # Reusable bottom sheet
      Skeleton.tsx            # Loading skeletons
      Badge.tsx               # Category badges
      Button.tsx              # Consistent buttons
  hooks/
    useWorkoutStore.ts        # Zustand store (replaces 18 useStates)
    useSync.ts                # Server sync with React Query
    useStreak.ts              # Memoized streak calculation
    useTheme.ts               # Theme management
    useNotifications.ts       # Notification scheduling
  lib/
    redis.ts                  # Keep existing
    workoutData.ts            # Keep existing
    twilioParser.ts           # Keep existing
    validators.ts             # Zod schemas for all API contracts
    sync.ts                   # Sync logic (merge, conflict resolution)
  types/
    workout.ts                # Shared TypeScript types
    recovery.ts
    api.ts
```

### 1.2 State Management (Zustand)
Replace 18 `useState` hooks with a single Zustand store:

```typescript
// hooks/useWorkoutStore.ts
interface WorkoutState {
  completions: Record<string, boolean>;
  logs: Record<string, LogEntry>;
  level: Level;
  theme: Theme;

  // Actions
  toggleCompletion: (key: string) => void;
  saveLog: (key: string, log: LogEntry) => void;
  setLevel: (level: Level) => void;
}
```

Benefits:
- No prop drilling
- Selective re-renders (components subscribe to specific slices)
- Middleware for persistence (zustand/persist)
- Easy to test

### 1.3 Server Sync (React Query)
Replace manual `fetch` + debounce with React Query:

```typescript
// hooks/useSync.ts
const { data, isLoading } = useQuery({
  queryKey: ['user-data'],
  queryFn: () => fetch('/api/sync').then(r => r.json()),
  staleTime: 30_000,
});

const mutation = useMutation({
  mutationFn: (data) => fetch('/api/sync', { method: 'POST', body: JSON.stringify(data) }),
  onMutate: async (newData) => {
    // Optimistic update
    queryClient.setQueryData(['user-data'], newData);
  },
});
```

Benefits:
- Automatic caching, deduplication, retry
- Loading/error states built-in
- Optimistic updates
- Background refetching

### 1.4 API Validation (Zod)
Add schemas to all routes:

```typescript
// lib/validators.ts
export const syncBodySchema = z.object({
  completions: z.record(z.boolean()),
  logs: z.record(z.object({
    feeling: z.number().min(1).max(5).optional(),
    duration: z.number().positive().optional(),
    notes: z.string().max(1000).optional(),
  })),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
});
```

### 1.5 Error Boundaries
Add at layout and component level:

```typescript
// app/(app)/layout.tsx
<ErrorBoundary fallback={<AppErrorFallback />}>
  <Suspense fallback={<DashboardSkeleton />}>
    {children}
  </Suspense>
</ErrorBoundary>
```

---

## Phase 2: Security Hardening

### 2.1 Twilio Webhook Validation
```typescript
import twilio from 'twilio';

const isValid = twilio.validateRequest(
  process.env.TWILIO_AUTH_TOKEN!,
  signature,
  url,
  params
);
```

### 2.2 Multi-Tenant Data Scoping
All KV keys prefixed with `user:{userId}:`:
- `user:{userId}:phone`
- `user:{userId}:recovery:{date}`
- `user:{userId}:completions`

### 2.3 Rate Limiting
Use Upstash rate limiter on:
- `/api/sync` — 60 requests/minute per user
- `/api/extract-metrics` — 10 requests/hour per user
- `/api/twilio/webhook` — 30 requests/minute per phone

### 2.4 Encrypted PII
Phone numbers encrypted before Redis storage using Node `crypto.subtle`.

---

## Phase 3: Design System & UX

### 3.1 Design Tokens
Define in `tailwind.config.js`:

```javascript
extend: {
  colors: {
    surface: {
      base: 'var(--surface-base)',
      card: 'var(--surface-card)',
      elevated: 'var(--surface-elevated)',
    },
    accent: {
      primary: 'var(--accent-primary)',    // Blue-500
      success: 'var(--accent-success)',    // Green-500
      warning: 'var(--accent-warning)',    // Amber-500
      danger: 'var(--accent-danger)',      // Red-500
    },
    text: {
      primary: 'var(--text-primary)',
      secondary: 'var(--text-secondary)',
      muted: 'var(--text-muted)',
    },
  },
  spacing: {
    safe: 'env(safe-area-inset-bottom)',
  },
  borderRadius: {
    card: '1rem',
    sheet: '1.5rem',
    button: '0.75rem',
  },
}
```

### 3.2 Mobile UX Improvements
- **Bottom sheet modals** (not centered dialogs) — feels native on mobile
- **Swipe gestures** — swipe right to complete, swipe left to log
- **Pull-to-refresh** — syncs data
- **Haptic feedback** — on completion toggle (via Vibration API)
- **Safe area padding** — iPhone notch/Dynamic Island
- **Larger touch targets** — minimum 44x44px per Apple HIG
- **Bottom navigation** — Today / Week / Progress / Recovery tabs

### 3.3 Animations (Framer Motion)
- Session card completion: smooth checkmark draw + subtle scale
- Modal transitions: slide-up bottom sheet with spring physics
- Confetti: GPU-accelerated with `will-change: transform`
- Heatmap: progressive fill animation on mount
- Page transitions: crossfade between tabs
- Respect `prefers-reduced-motion`

### 3.4 Desktop Layout
- Two-column layout: day sessions (left), week overview + progress (right)
- Wider cards with more detail visible by default
- Keyboard navigation (j/k to move between sessions, space to toggle)

### 3.5 Loading States
- Skeleton components matching real layout
- Shimmer animation while loading
- Optimistic UI for toggles (instant, rolls back on sync failure)

---

## Phase 4: Offline-First PWA

### 4.1 Service Worker Upgrade
```
Cache strategies:
- Static assets → Cache First
- API responses → Network First, fallback to cache
- Sync requests → Background Sync queue
```

### 4.2 Offline Sync Queue
When offline:
1. Writes go to IndexedDB queue
2. UI shows "saved locally" indicator
3. When back online, queue drains and syncs to server
4. Conflict resolution: timestamp-based, last-write-wins at field level

### 4.3 PWA Enhancements
- App shortcuts (quick-log today's workout)
- Push notifications (replace browser Notification API)
- Periodic background sync for recovery data
- Rich install prompt with screenshots

---

## Phase 5: Feature Enhancements

### 5.1 Wire Screenshot Scanning
Connect the existing `/api/extract-metrics` endpoint to RecoveryPanel:
- On screenshot upload → call API → auto-fill form fields
- Show scanning animation overlay
- Allow user to edit extracted values before saving
- Add `ANTHROPIC_API_KEY` to Vercel env vars

### 5.2 Recovery History View
- 7-day and 30-day charts for HRV, RHR, Sleep Score
- Trend indicators (improving/declining/stable)
- Correlate recovery trends with workout completion

### 5.3 Workout History & Analytics
- Weekly/monthly completion summaries
- Most consistent workout types
- Personal records tracking
- Time-of-day patterns

### 5.4 Multi-User SMS
- Per-user phone numbers stored with userId
- Cron iterates all registered users
- Timezone-aware reminders

### 5.5 Customizable Workouts
- Users can add/remove sessions
- Custom exercise definitions
- Template sharing

### 5.6 Export
- CSV export of completions and logs
- Weekly email summary
- Share progress image for social

---

## Phase 6: Testing & Observability

### 6.1 Testing
```
vitest              — Unit tests for hooks, utils, parsers
@testing-library    — Component tests
playwright          — E2E (complete workout flow, sync, auth)
msw                 — Mock API for component tests
```

Priority test targets:
1. Streak calculation
2. SMS parsing
3. Sync merge logic
4. API route validation
5. Auth flow (sign in → dashboard → sign out)

### 6.2 Observability
- **Sentry** — Error tracking + performance monitoring
- **Web Vitals** — LCP, CLS, FID/INP reporting
- **Custom analytics** — workout completed, recovery logged, streak milestone
- **Health endpoint** — `/api/health` returning Redis status + uptime

---

## Implementation Order

For V2 development, work in this order to minimize breakage:

1. **Types & validators** — Define all TypeScript types and Zod schemas
2. **Zustand store** — Create store, migrate state from useState
3. **Component extraction** — Pull components out of page.tsx one at a time
4. **Design tokens** — Set up Tailwind config, replace hardcoded colors
5. **Security fixes** — Twilio validation, user-scoping, rate limiting
6. **React Query** — Replace manual fetch/sync with React Query
7. **Mobile UX** — Bottom sheets, safe areas, touch targets
8. **Animations** — Framer Motion for transitions
9. **Offline** — Service worker upgrade, sync queue
10. **Features** — Screenshot scanning, history, analytics
11. **Testing** — Unit, component, E2E
12. **Observability** — Sentry, analytics, health checks

---

## Dependencies to Add for V2

```json
{
  "zustand": "^5",
  "@tanstack/react-query": "^5",
  "zod": "^3",
  "framer-motion": "^12",
  "vitest": "^3",
  "@testing-library/react": "^16",
  "playwright": "^1.50",
  "msw": "^2",
  "@sentry/nextjs": "^9",
  "next-pwa": "^5",
  "twilio": "^5"
}
```

---

## Success Metrics for V2

- **Performance:** LCP < 1.5s, CLS < 0.1, INP < 200ms
- **Reliability:** Zero unhandled errors in production (Sentry)
- **Mobile:** Lighthouse PWA score > 95
- **Code quality:** page.tsx < 100 lines, no file > 300 lines
- **Test coverage:** > 70% for hooks and utils
- **Sync:** < 500ms sync latency, zero data loss offline → online
