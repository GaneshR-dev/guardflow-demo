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

## 2026-11-14 · Uniform UX and uninterrupted typing · Instinct · ux/uniform-cleanup
- Request: Apply the approved whole-app cleanup. Keep functions, roles and saved data unchanged.
- Changed: Shared touch targets, type, spacing, cards and status contrast. Attendance has one summary and visible location context. Location details have padded shift cards and a clear Edit button. Shift editing is focused, keeps failed drafts and blocks duplicate saves. Settings opens the one location directory. Search inputs stay mounted during result updates, so native repeat, word deletion and composition keep their targets. Simple location names stay visible.
- Tests: 126 passed, 2 PostgreSQL-only checks skipped. This includes 11 new UX browser checks at 320, 390 and 1280 px. Ruff lint and format passed. JavaScript syntax and Prettier passed. Local fictional-data renders for both roles had no page errors.
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
