# Outage Money V2 Design

## Goal
Upgrade the existing Outage Money GitHub Pages app into a robust shared mobile-first outage earnings planner while preserving the original core experience: open the app and immediately see the current estimated net overtime balance.

## Success criteria
- Main screen remains minimal and fast.
- Shared Hours and Spend data works between devices with no account/login/PIN for the second user.
- Forecasts, milestones, calendar, progress, achievements and fun effects are derived from the real overtime schedule.
- Overtime/pay calculations remain based on the established payroll assumptions.
- The app is installable as a PWA and continues to work as a GitHub Pages site.
- Shared data changes cannot overwrite unrelated changes from another device.
- No service-role/secret Supabase key is exposed in the public GitHub repository.

## Existing payroll model
- Basic rate: £37.21/hour.
- Weekday overtime: 1.5×.
- Weekend overtime: 2×.
- Overtime is non-pensionable.
- Pension is salary sacrifice.
- Tax code: 1257L.
- NI category: A.
- Current calibrated net overtime factor: 58%.
- All calculations use full precision internally.
- Displayed currency is rounded to the nearest penny.
- Timezone: Europe/London, including BST/GMT changes.

## Existing schedule correction
The alternating short-Friday pattern is retained:
- 18 Sep 2026: 15:30–16:30.
- 2 Oct 2026: 15:30–16:30.
- 16 Oct 2026: 15:30–16:30.
- 30 Oct 2026: 15:30–16:30.

## Main screen
The main screen contains only:
- Hours button.
- Plan button.
- Spend button.
- Large current net outage balance.
- EARNING NOW / NOT EARNING status.
- Outage completion ring.
- Countdown personality text.
- Small sync indicator.

It must not show gross earnings, net/minute or net/hour.

### Main balance definition
Current balance =
1. Net overtime earned up to the current exact time,
2. minus all expenditure entries, including future-dated expenditure.

The balance may be negative.

### Completion ring
The completion ring is based on earnings progress, not calendar progress:

net overtime earned so far / total net overtime currently planned

Spending does not affect the ring.

## Plan screen
Plan contains three areas: Forecast, Calendar and Fun.

### Forecast
Display:
- Future balance: user selects a date; calculate projected balance at the end of that day.
- Net overtime earned so far.
- Remaining outage earnings from now onward.
- Projected total net overtime earnings from the current schedule.
- Current total expenditure.
- Projected end-of-outage balance.

Future balance includes all planned overtime through the selected date and subtracts all expenditure currently entered.

Remaining outage earnings is earnings-only and ignores expenditure.

End-of-outage balance = total net overtime earned/planned minus total expenditure.

## Calendar
Provide a month-style calendar.

Each day is visually classified as:
- Completed overtime.
- Active overtime now.
- Future overtime.
- No overtime.
- Today.
- Weekend double-time.

Where space permits, show the day's net overtime value.

Tapping a date opens a bottom sheet/card with all overtime periods for that date and its net value, with edit controls.

## Hours management
Hours defaults to today and supports:
- Add overtime.
- Edit start/finish time.
- Delete/cancel period.
- Edit rate if needed.
- Multiple overtime periods on one date.

Quick controls on a selected period:
- -30m.
- +30m.
- -1h.
- +1h.
- Cancel OT.
- Edit precisely.

Quick +/- controls adjust the finish time only.

## Spend
Expenditure supports:
- Description.
- Amount.
- Date.
- Add.
- Edit.
- Delete.

Any expenditure subtracts immediately regardless of its date.

## Milestones
Milestones are based on cumulative net overtime earned before spending, so spending never removes or retriggers them.

Default major milestones:
- Every £1,000 earned.

Display:
- Achieved milestones and actual date achieved.
- Future milestones and projected achievement date according to the current overtime schedule.

Milestone forecast dates update automatically after schedule edits.

## Milestone celebrations
When a major milestone is crossed while the app is open:
- Full-screen celebration.
- Money rain/confetti/coins.
- Large milestone amount.
- Achievement card where applicable.
- Completion ring animation.

Visual only; no sound by default.

Each device should display a given milestone celebration only once.

## Money Rain
Money Rain is used only for:
- £1,000 earnings milestones.
- Major achievement unlocks.
- Final weekend boss defeat.
- Outage completion.

It must not appear during normal use.

## Shift-complete animation
When an overtime period finishes while the app is open, show a short visual:
- ANOTHER ONE BITES THE DUST.
- DONE / SHIFT COMPLETE.
- Net amount earned for that period.
- Hours completed.

Then automatically return to the normal screen.

Do not show stale full-screen completion animations for shifts that ended while the app was closed.

## Weekend Boss Battles
Weekend overtime periods have a Fun visualisation.

Boss progress is directly based on real time remaining in the active weekend period.
Display:
- Saturday Boss or Sunday Boss.
- Progress/health bar.
- Remaining time.
- Remaining seconds / boss HP.
- Net earned so far in that period.
- Net remaining in that period.

At completion:
- Boss Defeated animation.
- Shift net amount.
- Relevant achievement.
- Money rain.

This is not a separate game and never alters payroll data.

## Achievement system
Initial achievements:
- Professional Clock Watcher: complete 10 OT periods.
- Sold My Saturday: complete first Saturday OT period.
- Sunday Service: complete first Sunday OT period.
- Weekend Warrior: complete OT on both Saturday and Sunday in one weekend.
- Double-Time Demon: complete 50 hours at 2×.
- £5K Gremlin: earn £5,000 cumulative net overtime.
- I Live Here Now: complete 100 overtime hours.
- Human Overtime Machine: complete 150 overtime hours.
- Outage Survivor: complete the final scheduled overtime period.

Achievements are derived from schedule/completion state rather than manually edited.

Locked achievements are visible as silhouettes; unlocked achievements are fully rendered.

## Outage levels
Level/rank is based on cumulative net overtime earned, not current balance.

Initial ranks:
- £0: Clock Watcher.
- £1,000: Overtime Apprentice.
- £2,000: Shift Goblin.
- £3,000: Weekend Merchant.
- £4,000: Double-Time Disciple.
- £5,000: £5K Gremlin.
- £6,000: Overtime Menace.
- £7,000: Financial Hazard.
- £8,000: Human Overtime Machine.
- Final outage completion: Outage Warlord.

Level appears in the Fun/Plan area, not prominently on the main screen.

## Things You Could Have Bought
Provide deliberately approximate/funny comparisons for the current cumulative earnings or balance.

These are entertainment only and must be clearly treated as rough equivalents, not current retail-price claims.

Rotate comparisons between visits.

## End-of-outage countdown
The final outage time is derived from the final overtime period currently in the schedule.

Adding or removing late overtime automatically changes the countdown.

Countdown personality examples:
- 30+ days: “43 days to freedom”.
- 15–30 days: “22 days. Excellent life choices.”
- 8–14 days: “11 days. You vaguely remember weekends.”
- 3–7 days: “5 days. DO NOT ACCEPT MORE OT.”
- 1–2 days: “Nearly human again.”
- Final day: “LAST ONE.”
- Finished: “OUTAGE COMPLETE — YOU SURVIVED.”

## Shared data
GitHub Pages hosts the app.
Supabase stores shared data.

No second-user account, login or PIN is required.

The user receives one private invitation/share link containing a high-entropy tracker secret.

First-use flow:
1. App reads the secret from the link fragment.
2. App stores it locally on that device.
3. App removes it from the visible URL.
4. App loads the shared tracker.

The secret is never committed to the public repository.

It must be possible to rotate the secret later.

## Supabase security model
Do not expose a service_role key or secret key in the browser.

Move away from an openly writable anonymous single-row JSON model.

Use proper relational records and controlled database functions/API access.

Suggested logical model:
- trackers
- overtime_periods
- expenses

Each overtime period and expense is an independent record to prevent unrelated concurrent edits from overwriting one another.

The browser uses only the Supabase project URL + publishable key plus the private tracker secret.

Any database function that is callable from the browser must:
- Validate the private tracker secret.
- Restrict operations to the matching tracker.
- Expose only the minimum required data/actions.
- Avoid leaking internal secrets.

All exposed tables retain RLS/least-privilege controls.

## Sync behaviour
Indicator states:
- Synced.
- Saving…
- Offline.
- Changes available / refreshing.

Normal online flow:
1. User edits a record.
2. UI shows Saving…
3. Supabase confirms.
4. UI shows Synced.

Remote changes should appear within a few seconds.

The app keeps a local cache of the last successful shared state.

When offline:
- App still opens and displays cached data.
- Editing is disabled until connection returns, to avoid conflicting offline writes.

## PWA/offline
Retain:
- Outage Money app name.
- Existing custom icon.
- Standalone/full-screen mobile app behaviour.

Add:
- Service worker/app-shell caching.
- Fast offline launch.
- Cached last known shared data.
- GitHub Pages compatibility.

## Code structure
Replace the monolithic single-file implementation with a small no-build modular structure:

- index.html — app shell.
- styles.css — all visual styling/responsive layout.
- js/core.js — pure pay/time/forecast/progress calculations.
- js/data.js — Supabase/local-cache/sync implementation.
- js/ui.js — screens, dialogs, calendar and form UI.
- js/effects.js — money rain, milestone, shift-complete and boss animations.
- js/app.js — application startup and orchestration.
- manifest.json — PWA manifest.
- sw.js — service worker.
- icon-192.png.
- icon-512.png.

Use browser-native ES modules. No React/framework/build pipeline.

## Data migration
On first upgraded load:
- Read any existing locally saved V1 state.
- If the shared tracker has no data yet, offer/perform a one-time migration of that local schedule and expenditure into the shared backend.
- Never overwrite populated shared data automatically.
- Preserve the current supplied schedule/defaults if neither local nor shared data exists.

## Error handling
- Never silently discard an edit.
- Show a clear inline error when a save fails.
- Keep the user's current edit values available for retry.
- Prevent duplicate save actions while a request is in progress.
- If the shared secret is invalid/revoked, show a clear “link no longer valid” state rather than falling back to a new private dataset.

## Testing requirements
Automated tests must cover at minimum:
- Weekday 1.5× net calculation.
- Weekend 2× net calculation.
- Partial active period calculation.
- BST/GMT boundary handling.
- Expenses subtract immediately regardless of expense date.
- Future balance.
- Remaining earnings.
- End-of-outage balance.
- Completion ring math.
- Milestone actual/projected dates.
- Quick hour adjustment.
- Achievement conditions.
- Countdown/end-date derivation.
- Concurrent independent overtime/expense updates do not overwrite each other.
- Shared-secret access is accepted/rejected correctly.

Manual browser verification must cover:
- Mobile layout with no horizontal scrolling.
- Installable PWA behaviour.
- Hours/Plan/Spend flows.
- Calendar usability.
- Celebrations do not block normal use indefinitely.
- Two-browser/device shared sync.
- Offline cached read-only behaviour.

## Non-goals
Do not add:
- Games.
- Bank integration.
- User-account/login flows.
- Gross-pay dashboards.
- Tax/NI breakdown on the main UI.
- Constant animations.
- Audio by default.
- A framework or build system.

## Deployment
- Implement in the connected GitHub repository: joepepper1990/outage-money-tracker.
- Keep GitHub Pages as the production host.
- Apply required Supabase schema/security changes to the existing outage-money project.
- Preserve the current public GitHub Pages URL.
- Verify production after deployment.
