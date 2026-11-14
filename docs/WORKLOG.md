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
