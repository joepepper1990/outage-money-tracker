# Outage Money V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current monolithic Outage Money page with a secure shared mobile-first PWA that preserves the live net ticker and adds forecasting, calendar planning, progress, achievements and contextual celebration effects.

**Architecture:** Keep GitHub Pages as a no-build static host using browser-native ES modules. Move calculations into pure functions, use Supabase RPC functions over a private relational schema for shared state, and keep the high-entropy tracker secret only in the user's local browser after first joining through a URL fragment.

**Tech Stack:** HTML5, CSS, browser-native ES modules, Node.js built-in test runner, Fetch API, Service Worker API, Supabase Postgres/Data API, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-26-outage-money-v2-design.md`

## Global Constraints

- Basic rate: £37.21/hour.
- Weekday overtime: 1.5×.
- Weekend overtime: 2×.
- Current calibrated net overtime factor: 58%.
- Overtime is non-pensionable; pension is salary sacrifice; tax code 1257L; NI category A.
- Use full precision internally and round displayed currency to pennies.
- Use `Europe/London` for all schedule calculations, including BST/GMT changes.
- Main screen must not show gross earnings, net/minute or net/hour.
- Expenses subtract immediately regardless of their entered date.
- No second-user account, login or PIN.
- Never commit the private tracker secret or any Supabase service-role/secret key.
- Use only a Supabase publishable key in public browser code.
- No React/framework/build pipeline; use browser-native ES modules.
- GitHub Pages remains the production host and the existing public URL is preserved.
- Existing custom icons and Outage Money PWA identity are retained.
- Offline mode is cached/read-only; editing is disabled until connectivity returns.
- No games, bank integration, gross-pay dashboard, audio by default or constant animations.

## Review Focus

1. **Invalid/overlapping hours:** reject finish-before-start and same-day overlaps without losing the user's edit values.
2. **Timezone edge cases:** calculations must be identical on devices outside the UK and across the 25 October 2026 BST→GMT transition.
3. **Concurrent edits:** an overtime update from one phone and an expense update from another must both survive; no whole-state overwrite.
4. **Invalid/revoked share secret:** show a clear invalid-link state and never create or expose a different dataset.
5. **Loss of network during editing:** cached state remains readable, edits are blocked while offline, and reconnection restores normal sync without duplicate writes.

---

### Task 1: Establish the Pure Calculation Core and Test Harness

**Files:**
- Create: `package.json`
- Create: `js/core.js`
- Create: `tests/core.test.mjs`
- Reference: current calculation/default-schedule logic in `index.html`

**Interfaces:**
- Produces `BASIC_HOURLY_RATE: number`, `NET_FACTOR: number`, `DEFAULT_PERIODS: Period[]`.
- Produces `hourlyNetRate(multiplier: number): number`.
- Produces `londonDateTimeMs(date: string, time: string): number`.
- Produces `earnedForPeriod(period: Period, nowMs: number): number`.
- Produces `calculateSnapshot(periods: Period[], expenses: Expense[], nowMs: number): Snapshot`.
- Produces `validatePeriod(candidate: Period, periods: Period[]): ValidationResult`.
- Produces `adjustFinish(period: Period, deltaMinutes: number): Period`.
- `Period = { id:string, date:string, start:string, end:string, multiplier:1.5|2 }`.
- `Expense = { id:string, description:string, amount:number, date:string }`.

- [ ] **Step 1: Add the Node test harness and failing core tests**

Create `package.json` with `"type":"module"` and `"test":"node --test tests/*.test.mjs"`.

In `tests/core.test.mjs`, add tests asserting:
- `hourlyNetRate(1.5) === 32.3727`.
- `hourlyNetRate(2) === 43.1636`.
- One elapsed hour of a weekday period earns £32.3727.
- A future-dated expense is subtracted immediately from `totalNet`.
- The corrected supplied schedule includes 18 Sep, 2 Oct, 16 Oct and 30 Oct ending at 16:30.
- Corrected planned net total is £8,103.9659 before spending.
- 25 Oct 2026 London time resolves consistently across the BST/GMT boundary.
- `validatePeriod` rejects a finish-before-start period and a same-date overlap.
- `adjustFinish(period, 30)` changes only the finish time and refuses to produce a finish at/before start.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL because `js/core.js` does not yet exist/exports are missing.

- [ ] **Step 3: Implement the core exports in `js/core.js`**

Preserve the existing Intl-based `Europe/London` resolution strategy, but make it the only resolver used by production calculations. Correct the four alternating Friday defaults listed in the spec.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`  
Expected: all Task 1 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json js/core.js tests/core.test.mjs
git commit -m "refactor: extract tested outage calculation core"
```

---

### Task 2: Replace the Shared JSON Row with a Secure Relational Supabase API

**Files:**
- Create: `supabase/schema-v2.sql`
- Create: `tests/supabase.integration.test.mjs`
- Modify later through Supabase MCP: existing `outage-money` project `duskpiqfimuxjpnqcolx`

**Interfaces:**
- Creates private tables `private.om_trackers`, `private.om_periods`, `private.om_expenses`.
- Browser-callable RPCs:
  - `public.om_read_state(p_tracker_id uuid, p_secret text) -> jsonb`
  - `public.om_upsert_period(p_tracker_id uuid, p_secret text, p_period jsonb) -> jsonb`
  - `public.om_delete_period(p_tracker_id uuid, p_secret text, p_period_id uuid) -> jsonb`
  - `public.om_upsert_expense(p_tracker_id uuid, p_secret text, p_expense jsonb) -> jsonb`
  - `public.om_delete_expense(p_tracker_id uuid, p_secret text, p_expense_id uuid) -> jsonb`
- Secret is stored only as SHA-256 hash in the database.
- RPCs return the current tracker state after successful writes.
- Public tables are not directly writable/readable by `anon`.

- [ ] **Step 1: Verify current Supabase changelog/docs before writing SQL**

Check current Supabase changelog plus docs for Data API RPC, publishable keys, RLS/security-definer functions, explicit grants and `pgcrypto`. Confirm no relevant breaking change.

- [ ] **Step 2: Write failing integration tests**

In `tests/supabase.integration.test.mjs`, read `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `TRACKER_ID`, and `TRACKER_SECRET` from environment variables and assert:
- correct secret can read state;
- wrong secret receives a non-2xx response;
- upserting an overtime period and then an expense preserves both records;
- updating the overtime period does not remove the expense;
- deleting one record leaves the other intact.

Skip with an explicit message only when the four environment variables are absent.

- [ ] **Step 3: Run integration test and verify RED**

Run with real project URL/publishable key plus a generated tracker id/secret.  
Expected: FAIL because the V2 RPC functions do not exist.

- [ ] **Step 4: Implement `supabase/schema-v2.sql` and apply it through Supabase `execute_sql`**

Use `pgcrypto` for hashing. Put data tables in `private`, enable RLS as defense-in-depth, grant no direct `anon` table access, and use narrowly scoped `SECURITY DEFINER` RPCs with a fixed `search_path`. Explicitly revoke function execute from `PUBLIC`, then grant only the required RPCs to `anon`.

Create one tracker with a generated high-entropy secret; commit only the tracker UUID, never the plaintext secret.

Revoke anonymous access to the old `public.shared_tracker` table after V2 is verified, but leave the table intact as rollback data until final production verification.

- [ ] **Step 5: Run Supabase security/performance advisors**

Expected: no unresolved security or performance warnings attributable to the new schema/functions.

- [ ] **Step 6: Run integration tests and verify GREEN**

Run: `npm test` with the four Supabase environment variables.  
Expected: all core and integration tests PASS, including wrong-secret rejection and independent-record concurrency.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema-v2.sql tests/supabase.integration.test.mjs
git commit -m "feat: add secure shared outage data API"
```

---

### Task 3: Implement Shared Data Client, Join Link and Offline Cache

**Files:**
- Create: `js/data.js`
- Create: `tests/data.test.mjs`

**Interfaces:**
- `parseJoinFragment(hash: string): { trackerId:string, secret:string } | null`.
- `consumeJoinFragment(locationLike, historyLike, storage): JoinCredentials | null` stores credentials under `outageMoneyV2Join` and removes the fragment from the visible URL.
- `createDataClient({ baseUrl, publishableKey, trackerId, secret, storage, fetchImpl }): DataClient`.
- `DataClient.readState(): Promise<SharedState>`.
- `DataClient.savePeriod(period): Promise<SharedState>`.
- `DataClient.deletePeriod(id): Promise<SharedState>`.
- `DataClient.saveExpense(expense): Promise<SharedState>`.
- `DataClient.deleteExpense(id): Promise<SharedState>`.
- Cache key: `outageMoneyV2Cache`.
- Legacy key read-only migration source: `outageMoneyTrackerV1`.

- [ ] **Step 1: Write failing tests**

Assert:
- a valid `#join=<tracker-id>.<secret>` fragment parses;
- malformed fragments are rejected;
- consuming a join fragment stores credentials and clears the fragment;
- cache serialization never contains the secret;
- `selectInitialState(shared, cache, legacy)` prefers populated shared state, then cache, then legacy/default;
- invalid credentials return an explicit `invalid_link` error state;
- offline state exposes cache but reports `canEdit:false`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL because `js/data.js` does not exist.

- [ ] **Step 3: Implement `js/data.js`**

Use plain `fetch` against Supabase REST RPC endpoints with the publishable key. Never log or cache the plaintext secret outside the dedicated join credential entry. Convert network errors into `offline`; convert 401/403-style authorization failures into `invalid_link`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`  
Expected: all data tests PASS.

- [ ] **Step 5: Commit**

```bash
git add js/data.js tests/data.test.mjs
git commit -m "feat: add shared data client and join flow"
```

---

### Task 4: Build the Mobile App Shell and Main Ticker

**Files:**
- Replace: `index.html`
- Create: `styles.css`
- Create: `js/ui.js`
- Create: `tests/shell.test.mjs`

**Interfaces:**
- Main DOM ids: `hoursBtn`, `planBtn`, `spendBtn`, `balanceValue`, `earningStatus`, `completionRing`, `countdownText`, `syncStatus`.
- `renderMain(snapshot, viewModel): void`.
- `setSyncState('synced'|'saving'|'offline'|'refreshing'|'invalid'): void`.
- Main ticker calls `calculateSnapshot` every second but does not write shared data.

- [ ] **Step 1: Write failing static shell tests**

Read `index.html` and assert the required ids exist, `styles.css` and `js/app.js` are linked, and strings `/ min`, `/ hour`, and `Gross` are absent from the main shell.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL against the current monolithic page.

- [ ] **Step 3: Implement the shell and responsive styling**

Use a three-button top bar, central earnings/progress treatment, status/countdown below, and a small unobtrusive sync indicator. CSS must prevent horizontal scrolling at 320px viewport width.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`  
Expected: shell tests PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css js/ui.js tests/shell.test.mjs
git commit -m "feat: rebuild minimal mobile outage shell"
```

---

### Task 5: Implement Hours and Spend Workflows with Quick Adjustments

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `js/ui.js`
- Create: `tests/editor.test.mjs`

**Interfaces:**
- `openHours(date: string): void`.
- `openSpend(): void`.
- Hours quick actions call `adjustFinish(period, -30|30|-60|60)`.
- Exact edit validates through `validatePeriod`.
- UI save/delete handlers call the matching `DataClient` method and update state only from the server-confirmed response.

- [ ] **Step 1: Write failing editor tests**

Assert:
- quick +30m changes `15:30–16:30` to `15:30–17:00`;
- quick -30m never moves finish to/before start;
- overlapping periods are rejected;
- an expense with a future date reduces the current balance immediately.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL for missing editor wiring/helpers.

- [ ] **Step 3: Implement Hours/Spend dialogs and quick controls**

Hours opens on today, supports date selection, multiple periods, exact editing, +/- controls and Cancel OT. Spend supports add/edit/delete. While `canEdit:false`, all mutation controls are visibly disabled.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`  
Expected: editor tests PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css js/ui.js tests/editor.test.mjs
git commit -m "feat: add fast shared hours and spending editors"
```

---

### Task 6: Add Forecast, Completion and Calendar Calculations

**Files:**
- Modify: `js/core.js`
- Modify: `js/ui.js`
- Modify: `index.html`
- Modify: `styles.css`
- Create: `tests/forecast.test.mjs`

**Interfaces:**
- `futureBalance(periods, expenses, date: string): number`.
- `remainingEarnings(periods, nowMs: number): number`.
- `projectedTotalEarnings(periods): number`.
- `endOfOutageBalance(periods, expenses): number`.
- `completionRatio(periods, nowMs): number` clamped to `0..1`.
- `dailyCalendarModel(year: number, monthIndex: number, periods, nowMs): CalendarDay[]`.
- `finalOutageEndMs(periods): number | null`.
- `renderPlanForecast(model): void`.
- `renderCalendar(model): void`.

- [ ] **Step 1: Write failing forecast/calendar tests**

Assert:
- future balance at end-of-day includes every period through that date and all expenses;
- remaining earnings excludes completed elapsed portions;
- end-of-outage balance equals total planned earnings minus all expenses;
- completion ratio ignores expenses;
- no-period state returns zero completion without NaN;
- calendar marks today, completed, active, future, no-OT and weekend 2× states correctly.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL because forecast/calendar exports do not exist.

- [ ] **Step 3: Implement forecast and calendar calculations**

Keep all time comparisons in `Europe/London`. Calendar day net amounts use full planned value, not elapsed value.

- [ ] **Step 4: Implement the Plan > Forecast and Plan > Calendar UI**

Future balance defaults to a future/selectable date. Calendar supports previous/next month and tapping a day opens its details/editor.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test`  
Expected: forecast/calendar tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/core.js js/ui.js index.html styles.css tests/forecast.test.mjs
git commit -m "feat: add outage forecast and calendar planning"
```

---

### Task 7: Add Milestones, Achievements, Levels and Countdown Personality

**Files:**
- Modify: `js/core.js`
- Modify: `js/ui.js`
- Create: `tests/fun-model.test.mjs`

**Interfaces:**
- `milestoneModel(periods, nowMs, step=1000): Milestone[]`.
- `deriveAchievements(periods, nowMs): Achievement[]`.
- `levelForEarnings(earned: number, outageComplete: boolean): Level`.
- `countdownModel(periods, nowMs): { days:number|null, complete:boolean, copy:string }`.
- `purchaseComparisonModel(amount: number, seed: number): Comparison`.
- Achievement ids are stable machine-readable strings such as `sold-my-saturday` and `5k-gremlin`.

- [ ] **Step 1: Write failing fun-model tests**

Assert:
- spending does not affect milestone achievement;
- £5,000 unlocks `5k-gremlin`;
- first completed Saturday unlocks `sold-my-saturday`;
- Saturday+Sunday in one weekend unlocks `weekend-warrior`;
- 50 completed 2× hours unlocks `double-time-demon`;
- 100/150 completed OT hours unlock the corresponding badges;
- the final completed scheduled period unlocks `outage-survivor`;
- levels match the exact £0–£8k thresholds from the spec;
- the countdown end changes if a later period is added/removed;
- empty schedule produces a neutral countdown rather than an error.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL for missing fun-model exports.

- [ ] **Step 3: Implement milestone, achievement, level, countdown and comparison models**

Milestones/levels are based on cumulative net overtime earned before spending. Purchase comparisons use a fixed internal entertainment list and are labelled approximate.

- [ ] **Step 4: Render Plan > Fun**

Show current level, unlocked/locked badges, achieved/projected milestones, countdown and one rotating purchase comparison.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test`  
Expected: fun-model tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/core.js js/ui.js tests/fun-model.test.mjs
git commit -m "feat: add outage milestones achievements and levels"
```

---

### Task 8: Add Celebration Effects, Shift Completion and Weekend Boss Visuals

**Files:**
- Create: `js/effects.js`
- Modify: `styles.css`
- Modify: `js/core.js`
- Create: `tests/effects-model.test.mjs`

**Interfaces:**
- `bossModel(period: Period, nowMs: number): BossModel | null`.
- `detectJustCompleted(previousNowMs: number, nowMs: number, periods: Period[]): Period[]`.
- `runMoneyRain(options): Promise<void>`.
- `showMilestoneCelebration(milestone): Promise<void>`.
- `showShiftComplete(period, netAmount): Promise<void>`.
- `showBossDefeated(model): Promise<void>`.
- Device-local celebration history key: `outageMoneyV2Celebrations`.

- [ ] **Step 1: Write failing model tests**

Assert:
- boss model exists only for an active weekend period;
- boss progress moves monotonically from 0 to 1;
- HP equals remaining whole seconds and never goes negative;
- `detectJustCompleted` returns only periods crossed between the previous and current tick;
- reopening after a stale completed shift does not classify it as “just completed”.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL for missing effects/boss exports.

- [ ] **Step 3: Implement effects and boss model**

Effects are DOM/CSS overlays that auto-dismiss and never mutate payroll/shared data. Respect `prefers-reduced-motion` by replacing full motion with a short static celebration.

- [ ] **Step 4: Wire milestone/achievement/boss/shift-complete triggers**

Trigger only while the app is open and only once per device for each milestone/achievement id. Boss completion may trigger Money Rain.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test`  
Expected: effects-model tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/effects.js js/core.js styles.css tests/effects-model.test.mjs
git commit -m "feat: add outage celebrations and weekend boss visuals"
```

---

### Task 9: Orchestrate Shared Sync, Legacy Migration and Live App State

**Files:**
- Create: `js/app.js`
- Modify: `js/data.js`
- Create: `tests/app-state.test.mjs`

**Interfaces:**
- App polls shared state every 5 seconds when online.
- `migrateLegacyIfSharedEmpty(client, legacyState): Promise<SharedState>` migrates only when server has no period/expense records.
- `setSyncState` transitions are deterministic: refreshing → synced, saving → synced, network failure → offline, bad secret → invalid.
- Remote refresh replaces only the local cached server snapshot; unsaved form fields remain in the open editor until the user saves/cancels.

- [ ] **Step 1: Write failing orchestration tests**

Assert:
- populated server state is never overwritten by legacy local data;
- empty server state accepts one-time legacy import;
- two rapid saves cannot double-submit the same record;
- network failure sets read-only offline state;
- recovery from offline performs a fresh read before re-enabling edit controls;
- invalid secret never falls back to defaults or creates a tracker.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL because app orchestration does not exist.

- [ ] **Step 3: Implement `js/app.js` and migration/sync helpers**

Initialize join credentials, shared/cache state, UI, one-second ticker, five-second remote refresh and connectivity events. Register service worker only after the first successful render.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`  
Expected: all orchestration tests PASS.

- [ ] **Step 5: Commit**

```bash
git add js/app.js js/data.js tests/app-state.test.mjs
git commit -m "feat: orchestrate shared sync and legacy migration"
```

---

### Task 10: Add PWA App-Shell Caching and Production Manifest

**Files:**
- Create: `sw.js`
- Modify: `manifest.json`
- Modify: `index.html`
- Create: `tests/pwa.test.mjs`

**Interfaces:**
- Cache name is versioned, e.g. `outage-money-v2-1`.
- App shell includes `/`, `index.html`, `styles.css`, all JS modules, manifest and both icons.
- Service worker serves cached shell while offline but does not cache Supabase RPC responses.

- [ ] **Step 1: Write failing PWA static tests**

Assert:
- manifest name/short name are `Outage Money`;
- `display` is `standalone`;
- icon-192 and icon-512 are present;
- service worker cache list contains every local app-shell file;
- no Supabase URL or RPC response path is included in static cache rules.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`  
Expected: FAIL because V2 service worker is absent.

- [ ] **Step 3: Implement `sw.js` and update manifest**

Use cache-first for same-origin static assets and network-only for Supabase/other cross-origin requests.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`  
Expected: all PWA tests PASS.

- [ ] **Step 5: Commit**

```bash
git add sw.js manifest.json index.html tests/pwa.test.mjs
git commit -m "feat: make outage tracker an offline-capable PWA"
```

---

### Task 11: Full Verification, Security Lockdown and Production Deployment

**Files:**
- Modify only if verification finds defects.
- Production target: `main` branch of `joepepper1990/outage-money-tracker`.

**Interfaces:**
- Production URL remains `https://joepepper1990.github.io/outage-money-tracker/`.
- Private invitation URL is generated out-of-band as `https://joepepper1990.github.io/outage-money-tracker/#join=<tracker-id>.<secret>`.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`  
Expected: 0 failures and no unexpected skips; Supabase integration tests run with real environment variables.

- [ ] **Step 2: Run Supabase advisors**

Run security and performance advisors against project `duskpiqfimuxjpnqcolx`.  
Expected: no unresolved warnings caused by V2.

- [ ] **Step 3: Verify anonymous Data API permissions**

Using the publishable key:
- correct tracker secret can read/write only its tracker;
- wrong secret cannot read or mutate;
- direct anonymous table reads/writes are denied.

- [ ] **Step 4: Manual mobile-browser verification**

Verify at narrow/mobile widths:
- no horizontal scroll;
- main screen shows only intended information;
- Hours/Plan/Spend work;
- calendar is usable;
- quick +/- buttons behave correctly;
- celebration overlays dismiss automatically;
- reduced-motion path is usable.

- [ ] **Step 5: Verify shared two-client behaviour**

Open two independent browser contexts using the same invitation link:
- edit a period in A and confirm B sees it within 5 seconds;
- add an expense in B and confirm A retains the period edit and receives the expense;
- take one context offline, confirm cached read-only state and disabled edits;
- restore connectivity and confirm it refreshes before enabling edits.

- [ ] **Step 6: Verify PWA/offline behaviour**

Install/open as standalone where supported, load once online, then reload offline and confirm the app shell and cached last-known data open while edits remain disabled.

- [ ] **Step 7: Lock down the legacy backend**

After V2 production verification, revoke any remaining `anon`/`authenticated` access to `public.shared_tracker`. Keep the row/table for rollback unless a later explicit cleanup is requested.

- [ ] **Step 8: Deploy production**

Push/commit the verified V2 files to `main` and wait for GitHub Pages deployment.

- [ ] **Step 9: Verify the live production URL**

Fetch/open the production URL and confirm:
- V2 asset references resolve;
- no console-breaking syntax/import failures;
- live app can read shared state with a valid local invitation credential;
- production manifest/service worker are served.

- [ ] **Step 10: Provide the private join link to the user**

Return the normal production URL plus the one private invitation URL. State that the private link should be sent directly to the partner and not posted publicly.

