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

## 2026-11-14 · AI collaboration guide · Claude Code · feat/reports
- Request: Add rules for all AI tools: STE100, UX, UI theme, tests, existing components and the work log.
- Changed: `AGENTS.md`, `CLAUDE.md`, `docs/UI-GUIDE.md`, `docs/WORKLOG.md`, `README.md`
- Tests: `pytest -q tests/` without the 2 browser test files → 35 passed. Docs only, no code change.
- Open items: Find out which instruction file Instinct reads. If it does not read `AGENTS.md`, add a pointer file.

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
