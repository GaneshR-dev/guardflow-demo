# Work log

Each AI tool adds an entry here at the end of each task. Write in ASD-STE100.

## How to add an entry

1. Add the entry at the top of the list, below "Entries". The newest entry is first.
2. Use the template below. Keep each line short.
3. Put the entry in the same commit as the work.
4. Do not change or delete the entries of other collaborators.

Template:

```
## YYYY-MM-DD · <short title> · <AI tool> · <branch>
- Request: <one sentence>
- Changed: <files>
- Tests: <command> → <result>
- Open items: <none, or a short list>
```

## Entries

## 2026-11-17 · Attendance loads each site one time · Claude Code · feat/react-attendance
- Request: The filters and the search called the API again, but the screen already had all the data. Stop the extra requests.
- Changed: `screens/Attendance.tsx`: one query for each site (`['attendance', siteId]`, fresh for 30 s, loads again when the user comes back to the app). The status filter and the search work on the phone (`screens/attendance/filters.ts`: `filterRows()`, `matchesSearch()`, the same rule as the server search). The list filters at once on each key; the URL and the other-sites search wait 300 ms. `docs/UI-GUIDE.md`: data rule.
- Tests: `filters.test.ts` (new). `Attendance.test.tsx`: filters and search send no new request. `tests/test_next_attendance.py`: one attendance request after a filter tap. `npm test` → 127 passed. Browser with the local API: 4 filter taps and a search sent no attendance request.
- Open items: none.

## 2026-11-17 · Same section positions on each page · Claude Code · feat/react-attendance
- Request: Split each page into the same sections, and start each section at the same position on every page. Use the position of the "Mark attendance" title.
- Cause: the title row of Attendance had a 44 px icon, so it was 44 px high; the Home title row was 34 px. So the Attendance title was 5 px lower, and the sections under it 11 px lower.
- Changed: `layout/AppShell.tsx` `Page`: fixed sections (brand bar, 44 px title row with an optional action, 44 px context row from the new `context` prop, content). `screens/Home.tsx` and `screens/Attendance.tsx` use `context`. `docs/UI-GUIDE.md`: "Page sections".
- Tests: `tests/test_next_layout.py` (new): Home and Attendance have the same title, context and content positions; Guards has the same title position. `tests/test_next_home.py`: the scroll check now uses only visible cards (the disabled site is in a folded section) and waits for the scroll. `npm test` → 125 passed. Browser at 390 px: title 67, context 114, content 174 on Home and Attendance.
- Open items: none.

## 2026-11-17 · Edit times uses the site shift · Claude Code · feat/react-attendance
- Request: Fill the check-out time from the site shift, never past the shift end, and work out the check-out date. Make it fool-proof with few taps. Add the few-taps rule to the project file.
- Decisions: block a check-out after the shift end in the app and on the server; no check-out date field.
- Changed: `backend/demo_app.py`: `shift_window()` (the shift of a check-in: the nearest start on the day before, the day, or the day after; overnight shifts), `location_shift_rows()`, and `PATCH /api/attendance/times` refuses a check-in or check-out after the shift end (400) and works out the check-out date when it is not sent. The old app uses the same endpoint, so it gets the same rule.
- Changed: `frontend/src/lib/shift.ts` (the same rule), `screens/attendance/EditTimesSheet.tsx` (shift line, check-out filled from the shift, "Use shift end", "Still at work", worked-out date text, inline error and disabled Save). `AGENTS.md` §4: few taps and fool-proof rules. `docs/UI-GUIDE.md`: Edit times section.
- Tests: `tests/test_edit_times_shift.py` (new, 9 passed), `tests/shift_helpers.py` (changes a site's shifts for one test and restores them). Updated 3 old tests that edited past the HSR shift end. `npm test` → 125 passed. `pytest -q tests/` → all pass except the 5 old search tests that also fail on `origin/main` on macOS. Browser with the restarted local API: auto-fill, 400 from the server, inline error.
- Open items: Live check-out (the Check out button) still records the real time, also after the shift end. A record with such a check-out cannot be edited until its check-out is at or before the shift end.

## 2026-11-17 · Attendance review: check-in button, edit sheet · Claude Code · feat/react-attendance
- Request: Show the edit button on checked-out cards. Make "Check in" on a checked-out card look like the other "Check in" buttons. Make the reason a text area. Make the edit sheet text simpler.
- Changed: `screens/Attendance.tsx`: "Check in" is always filled. `screens/attendance/EditTimesSheet.tsx`: shadcn `Textarea` for the reason (3 lines, 0/200 counter); shorter text ("Times are in IST. Your reason goes to the activity log."); each hint is under its field.
- Checked: the edit button already shows on checked-out cards for admins (browser and tests). Supervisors do not get it (only admins can edit times).
- Tests: `npm test` → 111 passed. Browser tests passed. Lint, format, typecheck, build → passed.
- Open items: none new.

## 2026-11-17 · Attendance design review changes · Claude Code · feat/react-attendance
- Request: Use the Home tile style for the filters. Make each guard card bigger with space between cards. Give the actions the same size and put the edit icon at the top right. Add "Add a guard" at the top right. Make the screen work for many guards (the collaborator chose a sticky search and filters).
- Changed: `components/StatTile.tsx` and `lib/tone.ts` (shared by Home and Attendance). `screens/attendance/`: `StatusTiles.tsx`, `CompactFilters.tsx`, `filters.ts`, `AttendanceRow.tsx` (`GuardCard`, `GuardList`, fixed 112 px actions). `screens/Attendance.tsx`: sticky search bar with compact filters (shown when the tiles scroll away), top-right "Add a guard", "Can't find a guard?" as one line and a link (no box, the collaborator's choice) only for an empty search. `layout/AppShell.tsx`: `Page` `action` prop.
- Tests: `npm test` → 111 passed. `tests/test_next_attendance.py` → 5 passed (card gap, equal button width, edit position, sticky bar with 60 guards). Browser at 390 and 320 px with the local API.
- Open items: none new.

## 2026-11-17 · React Attendance screen · Claude Code · feat/react-attendance
- Request: Move Attendance to React. The collaborator chose one screen with an action on each row, in place of the 3 old screens.
- Changed: `frontend/src/screens/Attendance.tsx` and `screens/attendance/` (filter grid, guard row, actions hook, edit-times and add-guard sheets). `lib/hours.ts` (hours worked, the record that check-out closes, one row for each guard). Types in `types/api.ts`. `routes.tsx`: `/attendance`, and the old `/attendance/add` and `/attendance/checkout` open the matching filter.
- Changed: `components/ConfirmDialog.tsx` blocks a fast double tap (a test found two check-ins from one double tap). A new question (second shift) ignores taps for 400 ms.
- Tests: `npm test` → 103 passed. `tests/test_next_attendance.py` (new, Playwright) → passed. Lint, format, typecheck, build → passed. Browser at 390 px with the local API: check-in, check-out, second-shift dialog, search, admin and supervisor.
- Open items: Server messages still use "Employee" and "location" (for example "Employee not found"). Change them in a backend PR with the old app tests. Figma not changed (plan limit).

## 2026-11-17 · Grey for "Checked out" · Claude Code · feat/react-signin
- Request: Show "Checked out" in grey.
- Changed: `frontend/src/screens/Home.tsx`: the "Checked out" tile number is grey (`text-muted-foreground`, 5.9:1). `lib/format.ts`: `STATUS_TONE` gives "completed" the tone "grey". `docs/GLOSSARY.md`: one colour for each status (green = Checked in, grey = Checked out, amber = Not checked in). `docs/UI-GUIDE.md`: Home tiles.
- Tests: `npm test` → 75 passed (Home test checks the tile colours). Lint, format, typecheck, build → passed. Browser at 390 px: contrast 5.9:1 or more on each tile.
- Open items: Use the same colours on Attendance and Reports when they move.

## 2026-11-17 · One word list for the app text · Claude Code · feat/react-signin
- Request: Make the app words the same on each screen, as part of the migration. Keep a Markdown file that tells what each word means.
- Decisions: "guard" (not employee or staff), "site" (not location or branch), statuses "Checked in", "Checked out", "Not checked in". React screens only. The old app does not change.
- Changed: `docs/GLOSSARY.md` (new): app words, meanings, words not to use, screen titles, nav labels and writing rules. `AGENTS.md`, `docs/UI-GUIDE.md`, `README.md` link it.
- Changed: React text: nav "Home, Attendance, Guards, Sites, Reports, Settings" (no short forms, one line down to 320 px). Home, `ScreenError`, `LocationSheet` and the screen titles use "guard" and "site". Times show as "9:00 am" (no leading zero).
- Changed: `frontend/src/glossary.test.ts` (new): fails when app text in a screen has a word that the glossary does not allow.
- Tests: `npm test` → 75 passed. Lint, format, typecheck, build → passed. `pytest -q tests/` → all pass except the 5 old `test_search_keeps_native_input…` tests (they also fail on `origin/main` on macOS). Ruff → passed. Browser at 390, 360 and 320 px.
- Open items: The old app keeps the old words until each screen moves. URL paths (`/employees`, `/locations`) keep the old names.

## 2026-11-17 · React Home screen with a clearer purpose · Claude Code · feat/react-signin
- Request: Build the newer Home design in React. Remove the double location control. Add improvements that use the data we have today.
- Changed: `frontend/src/screens/Home.tsx`: four big summary tiles (the collaborator chose them over one summary sentence; labels 13 px, not 10 px), no location picker, locations grouped by need (`lib/coverage.ts`: needs attention, upcoming from the shift times, everybody came, disabled folded). A card opens Attendance for that location. One location shows a "Mark attendance" button. "Updated" time and Refresh. Loading, empty (admin and supervisor), error and failed-refresh states.
- Changed: `layout/AppShell.tsx`: the 430 px `#f7faff` panel of the old app. `index.css`: `text-muted-foreground` is now `#56657b` for 4.5:1 contrast. `components/ProgressBar.tsx`. `tests/next_app.py`: shared helper for the /next browser tests.
- Tests: `npm test` → 58 passed. `tests/test_next_home.py` (new) and `tests/test_next_signin.py` → 9 passed. Ruff → passed. Browser at 390 px with the local API: groups, links, contrast 5.1:1 or more.
- Open items: Attendance is not in React yet, so a card opens the "not here yet" screen. Figma not changed (plan limit): add Home with the sign-in screen. The dashboard counts only today's records, so a guard on an overnight shift from yesterday counts as "not in".

## 2026-11-17 · React sign-in screen with a better design · Claude Code · feat/react-signin
- Request: Add the sign-in screen to Figma, make the design better and move the screen to React.
- Changed: `frontend/src/screens/Login.tsx`: the real sign-in. Theme fields (no yellow autofill), focus ring, show/hide password, "Signing in…" state, one request only, wrong password clears and focuses the password, 5xx shows a plain message, help sheet for "Forgot password?", tap-to-fill demo accounts, footer in the page flow. shadcn `input`, `label`.
- Changed: `backend/demo_app.py`: `/api/health` returns `demo_mode`. `components/ui/sheet.tsx`: close button 44 px. `vite.config.ts`: `GUARDIAN_API` sets the dev API address.
- Tests: `npm test` → 44 passed. `tests/test_health.py` (new), `tests/test_next_signin.py` (new, Playwright, 7 passed). `pytest -q tests/` → all pass except the 5 `test_search_keeps_native_input…` tests that also fail on `origin/main` on macOS. Ruff → passed. Browser at 390 px: states, contrast, admin and supervisor sign-in.
- Open items: Figma not changed: the Figma MCP Starter plan limit was used up. Add the "Sign in" page to Figma when the limit resets. `--muted-text` is below 4.5:1 on light backgrounds; check the other screens when they move.

## 2026-11-17 · React migration Phase 1: shared core · Claude Code · feat/react-setup
- Request: Start Phase 1 of the React migration. Move the shared helpers that each screen uses.
- Changed: `frontend/src/lib/api.ts` (`api()`, `ApiError`, `friendlyError()`), `auth/session.ts` (session store with the old localStorage keys, 401 ends the session), `auth/signOut.ts`, `lib/format.ts`, `lib/toast.ts`, `lib/queryClient.ts` (no retry on 4xx, cache cleared on a session change), `types/api.ts`.
- Changed: Components `EmptyState`, `ScreenError` (403, 404, 400/422, no network, 5xx), `LoadingRows`, `ErrorBanner`, `ConfirmDialog`, `LocationSheet`. Layout `Header`, `BottomNav`, `Page`. `routes.tsx` with all routes. Screens not moved yet show `NotMovedYet` with a link to the old screen. Settings has Sign out.
- Changed: The Vite dev server also sends `/app` to FastAPI, so the old and new app share the session. `docs/UI-GUIDE.md`: helper map and data rules.
- Tests: `npm test` → 30 passed. Lint, format, typecheck, build → passed. `pytest -q tests/` → 142 passed, 16 skipped. Ruff → passed. Browser at 390 px: sign-in redirect, nav (65 × 71 px targets, active tab), sign-out.
- Open items: Bottom nav labels are 11 px (the old app uses 10 px). Sign-in moves in Phase 2. Figma not read (no screen moved yet).

## 2026-11-17 · React migration Phase 0: setup · Claude Code · feat/react-setup
- Request: Move the frontend to React + TypeScript with a UI library. The collaborator chose shadcn/ui + Tailwind, TanStack Query and React Router, one screen in each pull request.
- Changed: New `frontend/` (Vite, React 19, TypeScript, Tailwind 4, shadcn/ui, TanStack Query, React Router, Vitest, oxlint, Prettier). The Guardian colour tokens are in `frontend/src/index.css` and mapped to the shadcn variables. A placeholder page links to the current app.
- Changed: `backend/demo_app.py`: `/next` serves `frontend/dist`. Client routes get `index.html`. `/app` does not change. `tests/test_next_frontend.py` (new).
- Changed: `.github/workflows/ci.yml`: new `frontend` job. `AGENTS.md`, `docs/UI-GUIDE.md`, `README.md`: React rules, helper map and run commands.
- Tests: `pytest -q tests/` → 142 passed, 16 skipped (Playwright not installed). Ruff → passed. `npm run lint`, `format:check`, `typecheck`, `test`, `build` → passed. Checked `/next` at 375 px in the browser.
- Open items: Vite 8 needs Node 22.12 or later. The deployment does not build `frontend/` yet, so `/next` shows 404 there. Next: Phase 1 (shared core). Figma not read (no screen changed).

## 2026-11-17 · Clear report counts, audit names and root entry · Instinct · fix/review-count-names-landing
- Request: Fix the three approved UX review findings. Keep the attendance flow unchanged.
- Changed: Day reports separate unique guards from entries. Status figures count entries.
- Changed: The activity log resolves current employee and location names within the company, including disabled records. Missing names use IDs.
- Changed: Audit details and CSV output stay unchanged. The root URL redirects to /app.
- Tests: Full pytest suite with embedded PostgreSQL: 195 passed, 2 skipped. Five new API and phone browser tests pass.
- Tests: Ruff lint, Ruff format and Prettier checks pass. Phone previews use fictional data.
- Design: Used docs/UI-GUIDE.md and existing components. Figma was not read.
- Open items: Preview approved. Run CI before merge, then verify the live release.

## 2026-11-17 · Direct check-in buttons like check-out · Instinct · feat/direct-checkin-buttons
- Request: Make check-in as short as check-out. Replace the Select step with a Check in button on each row. Show the time like check-out. Keep the confirmation popup, but remove the are-you-sure wording.
- Changed: Each waiting or ad-hoc employee row now has a Check in button. The confirmation popup is titled Confirm check-in and shows the employee, the IST check-in time, and the location. The Select step and the Check-in recorded screen are removed. A toast confirms the check-in. The list refreshes in place.
- Changed: The second-shift warning still comes after the check-in confirmation. Ad-hoc check-ins still show the location. Roles, time edits, and saved records stay unchanged.
- Tests: pytest -q tests/ → 190 passed, 2 skipped. Ruff check and format pass. Prettier check passes. Playwright tests cover the new flow.
- Open items: Show the preview to Deepak. Merge and deploy after his approval.

## 2026-11-16 · Attendance overview and sequential shifts · Instinct · feat/attendance-navigation
- Request: Use the overview as the admin home. Keep navigation in one taskbar. Prevent parallel shifts.
- Changed: Admin sign-in opens Attendance overview. Attendance uses Checked out. One taskbar has Home, Attend, Emp, Loc, Reports, and Settings. Settings has sign-out. Each Settings entry opens a separate screen with a back button. There is no hamburger.
- Changed: Check-in blocks any open shift. A later shift needs a supervisor warning and confirmation. Each shift keeps its own record.
- Changed: The schema removes the old employee/day limit. Migration keeps existing records and open duties. Time edits select one record.
- Changed: Attendance lists the latest shift at each site. Reports and exports retain all shifts. Overview totals count people once.
- Changed: New supervisor passwords need at least eight characters. The field label is Password. Existing account passwords stay unchanged.
- Tests: Full pytest suite: 170 passed, 2 skipped. Ruff and Prettier pass. Both-role phone layout and warning cancel/confirm tests pass.
- Tests: Isolated PostgreSQL upgrade keeps every attendance row. Concurrent cross-site starts queue on the employee lock. Only one starts.
- Visual review: Checked 12 screens in each role at390px. Unified avatars, name/ID type, row spacing, and stroke icons.
- Limits: Figma was not accessed. Existing UI components were used. No live test data was deleted, closed, or edited.
- Recovery: ALLOW_SEQUENTIAL_SHIFTS=false pauses extra shifts without changing saved data. Forced migration failure rolls back safely. See SEQUENTIAL-SHIFT-RECOVERY.md.
- Open items: Publish the branch, check CI, merge, and verify deployment. Preserve the existing overnight proof duty.

## 2026-11-16 · Overnight check-out shows the real hours · Instinct · fix/overnight-checkout-hours
- Request: Fix the 0h 00m in the check-out dialog for a check-in left open from an earlier day.
- Cause: `askCheckout()` read the today's-list row first. For an overnight worker that row is a LEFT JOIN shell with `check_in` NULL. The dialog then used the current time as the check-in time.
- Changed: `attendance-app.js`: `askCheckout()` now shows the record the backend closes. The backend check-out picks the newest open day. The dialog does the same: a real checked-in row from today first, then the newest stale open record. `tests/test_frontend_nov16.py` (new): three dialog cases - overnight shell, two stale opens, mixed today and stale.
- Review fix: the first version read the stale record first. That was wrong for legacy double-open data: the backend closes the newest open day, not the oldest stale one. It also regressed a mixed today-plus-stale record that the old code handled. The three new tests cover each case; each fails on the matching old code and passes on the fix.
- Tests: `pytest -q tests/` → 158 passed, 3 skipped. Ruff check and format → passed.
- Open items: Branch not merged: waiting for the owner's go-ahead.

## 2026-11-15 · Location filter on the Employees screen · Instinct · feat/employee-location-filter
- Request: Filter the employee directory by location with a dropdown that works together with the search box.
- Changed: `attendance-app.js`: location dropdown under the Employees search box in the shared field style (All locations by default, sites in name order with a (Disabled) mark, "No location yet" for admins); the pick combines with the name/ID search and a removed site resets it to all. `tests/test_employee_location_filter.py` (new): admin filter, search combine, reset, unassigned pick; supervisor option set without "No location yet".
- Review fix (same-tab role switch): an admin's "No location yet" pick survived sign-out in the tab's state, so a supervisor signing in next saw an empty directory behind a filter they cannot see. Sign-out now clears the location and search picks, and "No location yet" is invalid for non-admins (resets to all). Two new tests cover both paths; both fail on the old head and pass now.
- Tests: `pytest -q tests/` → 155 passed, 3 skipped in this sandbox (main: 149 passed, 3 skipped; +6 new tests, no regressions). Independent review sandbox: 156 passed, 2 skipped (main: 152 passed, 2 skipped); the count difference is `tests/test_supervisor_access_pg.py` (3 backend tests), which runs there because the optional `pgserver` and `psycopg` packages are installed and skips here. Both sandboxes skip the 2 isolated-PostgreSQL tests in `tests/test_multiple_shifts.py`. Ruff check and format → passed. Playwright renders at 320 and 390 px: dropdown matches the shared field style, filter narrows the directory, no page errors.
- Open items: Branch not merged: waiting for the owner's go-ahead.

## 2026-11-15 · Log sign-in on a disabled account · Claude Code · feat/app-logging
- Request: Write a log event when a disabled account signs in.
- Changed: `backend/demo_app.py`: `login()` writes `login.disabled` (warning, user ID and role) when the password is correct but the account is disabled. The 403 request line now also has the user ID and role. `tests/test_logging.py`: one new test.
- Tests: `pytest -q tests/` → 112 passed, 7 skipped. Ruff → passed.
- Open items: None.

## 2026-11-14 · Application logs · Claude Code · feat/app-logging
- Request: Add application logs. Do not log what users type.
- Changed: `backend/demo_logging.py` (new): JSON lines to stderr, `LOG_LEVEL`, removes sensitive keys. `backend/demo_app.py`: one log line for each `/api/*` request (route template, status, ms, request ID, user ID, role), `X-Request-ID` header, a plain 500 with the stack trace in the log, `login.ok`, `login.failed` and `login.throttled` without the username. `tests/test_logging.py` (new), `AGENTS.md` (log rules), `README.md`.
- Tests: `pytest -q tests/` without the 2 Playwright files → 86 passed. Ruff → passed.
- Open items: Check the logs in the ethiodeploy dashboard after deployment. Uvicorn also writes its own access log with query strings; turn it off with `--no-access-log` if the owner wants.

## 2026-11-14 · Uniform UX and uninterrupted typing · Instinct · ux/uniform-cleanup
- Request: Apply the approved whole-app cleanup. Keep functions, roles and saved data unchanged.
- Changed: Shared touch targets, type, spacing, cards and status contrast. Attendance has one summary and visible location context. Location details have padded shift cards and a clear Edit button. Shift editing is focused, keeps failed drafts and blocks duplicate saves. Settings opens the one location directory. Search inputs stay mounted during result updates, so native repeat, word deletion and composition keep their targets. Simple location names stay visible. Reports uses the same status labels, with a neutral historical label for missing check-ins.
- Tests: 129 passed, 2 PostgreSQL-only checks skipped. This includes 14 new UX browser checks at 320, 390 and 1280 px. Ruff lint and format passed. JavaScript syntax and Prettier passed. Local fictional-data renders for both roles had no page errors.
- Test maintenance: Updated old layout assertions. The existing unavailable-supervisor test now checks the shared retry screen rather than a partial form. Changed the unavailable development-only httpx2 pin from 2.16.0 to tested 2.14.0. Formatted backend/demo_db.py and tests/test_multiple_shifts.py; their parsed Python syntax trees are unchanged. No backend behavior, schema or runtime dependencies changed.
- Limits: Mobile keyboard long-press acceleration is keyboard-controlled. The app preserves native deletion; it does not force word deletion on every phone. No real-device keyboard or PostgreSQL concurrency certification. Figma was not accessed; the approved review and UI guide were used. Release and deployed-byte checks are recorded in the pull request.

## 2026-11-14 · Attendance integrity: stale check-outs, edit reasons, safe imports · Instinct · fix/attendance-integrity
- Request: Find where attendance can be faked or can fail. Make the trusted-supervisor flow hard to break.
- Changed: `backend/demo_app.py`: check-out closes a check-in left open from an earlier day and marks it "late checkout"; a new check-in is blocked while one is open; `/api/attendance` returns `stale_open`; time corrections need a reason and flag shifts over 24 hours in the audit (no hard cap until the owner confirms one); new GET `/api/audit` (admin only); imports keep the active flag, refuse disabled locations, log transfers and rebuild `assigned_count`; a repeated active phone number returns a warning, not a block. `attendance-app.js`: check-out screen lists stale check-ins; the time-edit form asks for a reason; new Settings > Activity log (admin only); duplicate-phone warnings show as toasts. `tests/test_attendance_integrity.py` (new); `tests/test_demo_app.py`, `tests/test_feature_nov14.py`, `tests/test_frontend_nov14.py` updated.
- Tests: `pytest -q tests/` → 89 passed, 1 failed (`test_frontend_landing.py::test_location_supervisor_list_empty_or_unavailable[unavailable]`; fails on `main` before this change too). Ruff check and format → passed. Manual Playwright check at 390 px: stale check-out list, time-edit reason field, Activity log (admin only) → correct.
- Open items: The 24-hour shift cap is a proposed rule, not confirmed policy, so edits over 24h warn (audit flag + reason) instead of blocking. Same-day second shift at another site is not supported (one record per person per day). Branch not merged: review first.

## 2026-11-14 · Disable locations and employees, keep them visible · Instinct · feat/disable-only
- Request: Admins disable locations and employees instead of removing them. Supervisors still see disabled records. Disabled rows show greyed out in the admin Employees screen.
- Changed: `backend/demo_app.py`: DELETE now disables; new POST `/enable` for employees and locations; disabled records stay in `/api/locations` and `/api/employees` with `active: 0`; check-in on a disabled employee or location returns 409; location grants stay on disable; the dashboard and the month summary keep disabled branches, with an `active` flag. `attendance-app.js`, `attendance-app.css`: greyed rows and cards, "Disabled" badge, Disable/Enable buttons, new confirm text; attendance screens only use active locations. `tests/test_disable_only.py` (new), `tests/test_feature_nov14.py`, `tests/test_frontend_nov14.py`, `tests/test_frontend_landing.py` updated for the new semantics.
- Tests: `pytest -q tests/` → 77 passed, 1 failed (`test_frontend_landing.py::test_location_supervisor_list_empty_or_unavailable[unavailable]`; fails on `main` before this change too). Ruff check and format → passed. Manual Playwright check at 390 px: admin and supervisor screens with disabled records → correct, no page errors.
- Open items: The Month report location cards have no Disabled badge yet (the Choose location sheet shows it). Branch not pushed: this tool has no push access.

## 2026-11-14 · Date picker on phones, clear empty Day state · Claude Code · fix/mobile-date-picker
- Request: The calendar does not open in a mobile browser. Day is empty while Month shows all locations.
- Changed: `attendance-app.js`, `attendance-app.css`: the real date/month input now covers the date button (invisible), so a tap opens the phone's own picker; with a mouse the app also calls `showPicker()`. The Day report for today with no guards shows "No guards at this location" with "Choose location".
- Tests: `pytest -q tests/` without the 3 browser test files → 48 passed. Ruff → passed. Manual Playwright check with iPhone 13 and Pixel 7 emulation: the tap lands on the date input, picking a date loads that day, the empty state and Choose location work, no page errors.
- Open items: Not checked on a real phone (emulation cannot open the native picker). Month shows all locations and Day shows one location: this is expected. The live data was not checked (no sign-in in the browser pane).

## 2026-11-14 · Shared error state on all screens · Claude Code · feat/reports
- Request: Use the 403 and 404 states on the other screens too.
- Changed: `attendance-app.js`: new `showScreenError()`, `screenErrorView()` and `friendlyError()`; Attendance, Check-in, Check-out, Home, Employees and Settings show the shared state for 403, 404, no network and server errors; check-in and check-out 403/404 show it too (409 stays in the banner); server errors show a plain message (also on Reports); some loaders had no error handling before. `AGENTS.md`, `docs/UI-GUIDE.md`: the new helpers.
- Tests: `pytest -q tests/` without the 3 browser test files → 48 passed. Ruff → passed. Manual Playwright checks on the local app: Attendance 403/404/network + Try again, Choose location, check-in 409 and 404, Home 500 + Try again, Employees 500, Settings network + Try again, all Reports cases → all correct, no page errors.
- Open items: None.

## 2026-11-14 · HTTP status in api(), 401, 403 and 404 handling · Claude Code · feat/reports
- Request: Add `err.status` to `api()` and handle 401 and 404.
- Changed: `attendance-app.js`: `api()` errors carry `status` (`httpError()`); a 401 (not on sign-in) calls `endSession()`, which clears the session and shows "Your session ended. Sign in again."; the Excel export does the same on 401; the Reports error state shows "No access to this location" (403) and "Location not found" (404) with "Choose location", and a clear message for 400/422.
- Tests: `pytest -q tests/` without the 3 browser test files → 48 passed. Ruff → passed. Manual check with Playwright on the local app: 403, 404, 401 on a request, 401 on export, wrong password → all correct, no page errors.
- Open items: Other screens (attendance, settings) still show the generic error banner for 403 and 404. Only the session-ended handling applies to all screens.

## 2026-11-14 · Rules for errors, loaders and toasts · Claude Code · feat/reports
- Request: Tell AI tools to always handle 404, API failures, network failures, loaders and toasts.
- Changed: `AGENTS.md` (new section "Errors, loading and feedback"), `docs/UI-GUIDE.md` (states table and checklist)
- Tests: Docs only, no code change. Tests not run.
- Open items: `api()` does not give the HTTP status code yet. The rules tell the next AI tool to add `err.status` one time when it needs it.

## 2026-11-14 · Reports screenshots for PR #13 · Claude Code · feat/reports
- Request: Add screenshots of the change to the pull request description.
- Changed: `docs/screenshots/reports/` (1 before image, 8 phone screenshots at 390 × 844, fictional demo data)
- Tests: Docs only, no code change. Tests not run.
- Open items: None.

## 2026-11-14 · Merge main and fix the "Not in" rows · Claude Code · feat/reports
- Request: Open a pull request for feat/reports.
- Changed: merged `origin/main` (shifts, admin controls, asset versioning). `backend/demo_app.py`: the whole-month list has stored history only; unrecorded employees show only on the Day report for today; removed locations are ignored. `tests/test_report_summary.py`: tests no longer depend on Mysuru. Ruff format for `backend/demo_app.py`, `backend/demo_seed.py`, `tests/test_feature_nov14.py` (format only).
- Tests: `pytest -q tests/` without the 3 browser test files → 48 passed, in any order. Ruff check and format → passed.
- Open items: Browser tests and `tests/test_security_regression.py` not run locally. CI runs them on the pull request (browser tests skip there).

## 2026-11-14 · Repository setup for collaboration · Claude Code · feat/reports
- Request: Add the six suggested items for safe collaboration.
- Changed: `.gitignore` (`.venv/`, `*.db`), `.gitattributes` (LF), `backend/requirements.txt` (`tzdata`), `requirements-dev.txt`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `README.md`, `AGENTS.md`, `tests/test_demo_app.py` (Ruff format only)
- Tests: `pytest -q tests/` without the 2 browser test files → 35 passed. Ruff check and format → passed. `tests/test_security_regression.py` was not run this time (blocked).
- Open items: CI has not run on GitHub yet. Protect the `main` branch in GitHub.

## 2026-11-14 · Figma rule for AI tools · Claude Code · feat/reports
- Request: Make other AI tools use the Figma file.
- Changed: `AGENTS.md` (Figma section), `docs/UI-GUIDE.md` (how to get access)
- Tests: Docs only, no code change. Tests not run.
- Open items: The owner must share the Figma file with each collaborator.

## 2026-11-14 · AI collaboration guide · Claude Code · feat/reports
- Request: Add rules for all AI tools: STE100, UX, UI theme, tests, existing components and the work log.
- Changed: `AGENTS.md`, `CLAUDE.md`, `docs/UI-GUIDE.md`, `docs/WORKLOG.md`, `README.md`
- Tests: `pytest -q tests/` without the 2 browser test files → 35 passed. Docs only, no code change.
- Open items: None. Instinct reads `AGENTS.md`, so it needs no pointer file.

## 2026-11-14 · Count unrecorded employees as "Not in" · Claude Code · feat/reports
- Request: Make the reports show the same "Not in" count as the attendance screen.
- Changed: `backend/demo_app.py` (`unrecorded_today()`, `includes_today()`), `tests/test_report_summary.py`
- Tests: `pytest -q tests/` → 35 API tests passed, in any order.
- Open items: Past days still show "no record" for absent guards. The backend does not store absences.

## 2026-11-14 · Unit and integration tests for the month summary · Claude Code · feat/reports
- Request: Add unit and integration tests for the new summary endpoint.
- Changed: `tests/test_report_summary.py`
- Tests: `pytest -q tests/` → all API tests passed.
- Open items: No frontend unit tests. The repository has no JavaScript test runner.

## 2026-11-14 · Reports redesign (Day / Month / History) · Claude Code · feat/reports
- Request: Make the reports page less cluttered. Follow the Figma design and its scenario screens.
- Changed: `attendance-app.js`, `attendance-app.css`, `backend/demo_app.py` (`/api/reports/summary`), `tests/test_demo_app.py`, `tests/test_frontend_landing.py`
- Tests: API tests passed. Browser test updated but not run.
- Open items: No call button for guards who are not in (no phone in report data).

## 2026-11-14 · Clear headcount labels on disabled branches · Instinct · fix/disabled-count-labels
- Request: A disabled branch read "0 employees" directly above its greyed employees and next to kept history. Make the count clear within the approved disabled-state scope.
- Changed: `backend/demo_app.py`: location payloads (`/api/locations`, `/api/settings`, `/api/dashboard`, `/api/reports/summary`, all via `location_rows`) now carry `disabled_count`, the number of disabled employees on the branch; `assigned_count` keeps meaning active employees. `attendance-app.js`: one `empCountLabel` helper renders "0 active employees · 3 disabled" whenever a branch has disabled employees (plain count otherwise), used on the locations picker, location detail, dashboard breakdown, settings locations panel and report location cards.
- Tests: new `tests/test_disable_only.py::test_location_payloads_expose_disabled_count_for_clear_labels` and `tests/test_frontend_nov14.py::test_disabled_headcount_label_clarifies_zero_active`. Results recorded below before merge.

## 14 Nov 2026 (evening) - EMP-ID self-entry and ad-hoc shifts

- Check-in and check-out screens now take an employee-entered EMP ID (lookup resolves any
  active employee with minimal fields: id, name, role, home site, active). The supervisor
  session remains the trust boundary; a supervisor can only mark at sites they manage.
- Pre-assignment is now a default, not a restriction: an employee assigned elsewhere (or
  unassigned) can take an ad-hoc shift at the marking site. The attendance row records the
  site actually worked, the audit stores adhoc + home_location_id, and reports/exports
  count the hours at the worked site. not_in counts stay consistent across screens.
- Activity log: admin-only CSV export of the full audit trail from Settings > Activity log.
- Fixed a SQLite-only `rowid` ordering in one test so the suite runs on Postgres too
  (full suite green on isolated Postgres 16.2).
- Known limits: one attendance record per employee per day across all sites (finishing a
  shift at site A then starting another at site B the same day is not supported yet); a
  disabled employee cannot be marked anywhere, but an employee whose HOME site is disabled
  can still work ad hoc at an active site.
