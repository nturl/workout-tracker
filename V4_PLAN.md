# Workout Tracker V4 Plan

## Context

V3 is shipped and stable (5,350 LOC, 89 tests, all security issues resolved). Recovery data currently enters via two paths: Eight Sleep SMS (auto-parsed by Twilio webhook) and manual screenshot upload (Claude Vision extraction). The end goal is direct API connections to Oura and Apple Health so recovery data flows in automatically without screenshots or SMS forwarding. Gemini Flash swap is a quick cost win since the AI extraction endpoint is the only Anthropic SDK consumer.

---

## Phase 1: Gemini Flash Swap

**Goal:** Replace Claude Haiku with Gemini Flash in the screenshot extraction endpoint. Cost reduction, same functionality.

**Files to modify:**
- `src/app/api/extract-metrics/route.ts` - swap `@anthropic-ai/sdk` for `@google/generative-ai`. Same prompts, same JSON output parsing.
- `src/__tests__/api/extract-metrics.test.ts` - update mock from Anthropic to Google AI SDK
- `package.json` - add `@google/generative-ai`, remove `@anthropic-ai/sdk`

**New env var:** `GOOGLE_AI_API_KEY`

**New dependency:** `@google/generative-ai`

---

## Phase 2: Oura OAuth Integration

**Goal:** Direct Oura Ring connection via OAuth2. Auto-pull daily readiness, sleep, and activity data into existing `RecoveryEntry.oura` field.

### New files to create:

| File | Purpose |
|------|---------|
| `src/lib/oauthTokens.ts` | Generic encrypted token storage/retrieval in Redis. Reuses AES-256-GCM pattern from `crypto.ts`. Keys: `user:{userId}:oauth:{provider}` |
| `src/lib/oura.ts` | Oura API client - auth URL builder, code-for-token exchange, token refresh, fetch daily sleep/readiness, map response to `RecoveryEntry["oura"]` shape |
| `src/app/api/oauth/oura/authorize/route.ts` | GET - generates Oura OAuth URL with state param, redirects user |
| `src/app/api/oauth/oura/callback/route.ts` | GET - receives OAuth redirect, exchanges code for tokens, encrypts and stores in Redis, redirects to app |
| `src/app/api/oura/sync/route.ts` | POST - fetches today's data from Oura API, maps to RecoveryEntry, stores at `user:{userId}:recovery:{date}` |
| `src/app/api/oura/status/route.ts` | GET - checks if user has valid Oura tokens |
| `src/app/api/oura/disconnect/route.ts` | POST - deletes stored tokens |

### Files to modify:

| File | Change |
|------|--------|
| `src/middleware.ts` | Add `/api/oauth/oura/callback` to public routes (receives redirect from Oura) |
| `src/lib/crypto.ts` | Add generic `encrypt()`/`decrypt()` functions (currently phone-specific names) |

### Key details:
- Token refresh with `withRetry` pattern (retry.ts) + WATCH/MULTI for race safety
- Rate limit all new endpoints (60 req/min for sync, 10 req/min for auth flows)
- CSRF + Zod validation on all POST routes
- State param in OAuth flow to prevent CSRF on callback
- Auto-sync can be triggered on app load or via cron

**New env vars:** `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`

**No new dependencies** - Oura API is standard REST, use native fetch

---

## Phase 3: Apple Health via Terra API

**Goal:** Use Terra (terra.co) as a bridge to Apple Health/HealthKit. Terra provides a widget for user auth and webhooks for data delivery.

### New files to create:

| File | Purpose |
|------|---------|
| `src/lib/terra.ts` | Terra API client - generate widget session, map incoming webhook data to RecoveryEntry shape |
| `src/app/api/terra/widget/route.ts` | POST - generates Terra widget session URL for user to connect Apple Health |
| `src/app/api/terra/webhook/route.ts` | POST - receives Terra webhook with health data, validates signature, stores recovery data |
| `src/app/api/terra/status/route.ts` | GET - checks if user has active Terra connection |
| `src/app/api/terra/disconnect/route.ts` | POST - deregisters user from Terra |

### Files to modify:

| File | Change |
|------|--------|
| `src/types/workout.ts` | Add `appleHealth?` field to `RecoveryEntry` with sleep, activity, body metrics |
| `src/lib/validators.ts` | Add `appleHealthSchema` to `recoveryEntrySchema` |
| `src/lib/helpers.ts` | Update `getRecoveryLevel()` to check `appleHealth` as third fallback |
| `src/middleware.ts` | Add `/api/terra/webhook` to public routes (receives webhook from Terra servers) |
| `src/hooks/useWorkoutStore.ts` | Deep-merge `appleHealth` in `hydrateFromSync` |

### Key details:
- Terra webhook signature validation (similar to Twilio pattern)
- Webhook must be idempotent (Terra retries on failure)
- Store Terra user ID at `user:{userId}:terra:userId` in Redis
- Map Terra's sleep/body/activity payloads to `appleHealth` field
- Recovery priority: Oura > Eight Sleep > Apple Health (existing `||` chain)

**New env vars:** `TERRA_API_KEY`, `TERRA_DEV_ID`, `TERRA_WEBHOOK_SECRET`

**No new dependencies** - Terra API is standard REST + webhook

---

## Phase 4: UI - Connected Accounts

**Goal:** Settings UI for managing Oura and Apple Health connections. Auto-sync indicators on recovery display.

### New files to create:

| File | Purpose |
|------|---------|
| `src/components/settings/ConnectedAccounts.tsx` | Connection status cards for Oura + Apple Health. Connect/disconnect buttons. Shows last sync time. |
| `src/hooks/useConnectedAccounts.ts` | React Query hooks for checking connection status + triggering sync |

### Files to modify:

| File | Change |
|------|--------|
| `src/components/settings/SettingsSheet.tsx` | Import and render `ConnectedAccounts` section |
| `src/components/recovery/RecoveryBanner.tsx` | Show data source badge (Oura/Eight Sleep/Apple Health) |
| `src/app/page.tsx` | Trigger Oura auto-sync on mount if connected (via useConnectedAccounts) |

### Key details:
- Connected account cards show: provider name, status (connected/disconnected), last sync timestamp
- Connect button opens OAuth flow (Oura) or Terra widget (Apple Health)
- Disconnect button with confirmation
- "Sync Now" button for manual refresh
- Auto-sync on app open if token exists and data is stale (>6 hours)
- Collapse screenshot upload UI when API connection is active (keep as fallback)

---

## Phase 5: Tests

**Goal:** Test coverage for all new code. Target: 30+ new tests.

### New test files:

| File | Covers |
|------|--------|
| `src/__tests__/lib/oauthTokens.test.ts` | Token encrypt/decrypt/store/retrieve |
| `src/__tests__/lib/oura.test.ts` | Oura API client, data mapping |
| `src/__tests__/lib/terra.test.ts` | Terra client, webhook data mapping |
| `src/__tests__/api/oura-authorize.test.ts` | OAuth URL generation |
| `src/__tests__/api/oura-callback.test.ts` | Token exchange + storage |
| `src/__tests__/api/oura-sync.test.ts` | Data fetch + store |
| `src/__tests__/api/oura-disconnect.test.ts` | Token deletion |
| `src/__tests__/api/terra-widget.test.ts` | Widget session generation |
| `src/__tests__/api/terra-webhook.test.ts` | Signature validation + data ingestion |
| `src/__tests__/api/terra-disconnect.test.ts` | Deregistration |
| `src/__tests__/integration/oura-flow.test.ts` | Full OAuth -> sync -> display flow |
| `src/__tests__/integration/terra-flow.test.ts` | Full widget -> webhook -> display flow |

Uses existing mocks: `__tests__/mocks/clerk.ts` (auth), `__tests__/mocks/redis.ts` (in-memory Redis)

---

## New Environment Variables Summary

| Variable | Phase | Purpose |
|----------|-------|---------|
| `GOOGLE_AI_API_KEY` | 1 | Gemini Flash API key |
| `OURA_CLIENT_ID` | 2 | Oura OAuth app client ID |
| `OURA_CLIENT_SECRET` | 2 | Oura OAuth app client secret |
| `NEXT_PUBLIC_APP_URL` | 2 | App base URL for OAuth redirects |
| `TERRA_API_KEY` | 3 | Terra API key |
| `TERRA_DEV_ID` | 3 | Terra developer ID |
| `TERRA_WEBHOOK_SECRET` | 3 | Terra webhook signature secret |

## Verification

After each phase:
1. `npm run build` - no type errors
2. `npm test` - all tests pass
3. `vercel deploy --prod` - deploy and verify on live URL
4. Phase 1: Upload a screenshot, confirm Gemini extracts metrics correctly
5. Phase 2: Connect Oura in settings, verify data appears in RecoveryBanner
6. Phase 3: Connect Apple Health via Terra widget, verify webhook delivers data
7. Phase 4: Check connected accounts UI, disconnect/reconnect flows
8. Phase 5: `npm test` - 119+ tests passing (89 existing + 30 new)
