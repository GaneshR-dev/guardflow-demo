# AGENTS.md — rules for AI tools in this repository

This file is the source of truth for every AI tool that works in this repository (Claude Code, Instinct and others). Read all of it before you start a task. Obey all rules.

## 1. Language: ASD-STE100 (mandatory)

Use ASD-STE100 Simplified Technical English for:
- All replies to collaborators in chat.
- All docs, including this file, `README.md` and `docs/`.
- All work log entries.
- All commit messages and pull request text.

Do not use STE100 rules for text that users see in the app. App text follows `docs/UI-GUIDE.md`.

STE100 rules to use:
- Write short sentences. Use a maximum of 20 words in an instruction and 25 words in a description.
- Use the active voice.
- Write one instruction in one sentence.
- Use the imperative for instructions ("Run the tests.").
- Use simple, approved words with one meaning. For example, use "start", not "initiate"; "use", not "utilize"; "make sure", not "ensure".
- Give the answer first. Give details only when the collaborator asks.
- Use short lists and tables when they help. Do not use long reports for a simple question.

## 2. The project in short

Guardian is a mobile-first attendance app for security guards.

| Part | Files | Technology |
|---|---|---|
| Frontend | `attendance-app.html`, `attendance-app.js`, `attendance-app.css` | Vanilla JavaScript, HTML and CSS. No framework. No build step. |
| Backend | `backend/demo_app.py` and `backend/demo_*.py` | Python 3.10+, FastAPI, SQLAlchemy |
| Database | — | SQLite on a local computer and in tests. PostgreSQL in deployment (`DATABASE_URL`). |
| Tests | `tests/` | pytest, FastAPI `TestClient`. Optional Playwright browser tests. |

Run and test commands are in `README.md`.

## 3. Before you start a task

1. Read the top entries of `docs/WORKLOG.md`. Learn what other collaborators did and what is open.
2. Read `docs/UI-GUIDE.md` before you change a screen.
3. Work on a branch. Do not commit on `main`.
4. If the request is not clear, ask the collaborator before you change code.

## 4. UX rules

- Design for a phone first: 390 px wide. Make sure that the screen also works on a wider screen.
- Make each touch target 44 × 44 px or larger.
- Give each screen one primary action.
- Give each data view three more states: loading, empty and error.
- In the error state, show a "Try again" button. Keep the filters of the user.
- Keep text contrast at 4.5:1 or more.
- Use real `<button>` elements for actions. Give an icon-only button an `aria-label`.
- Show each number one time only on a screen. Do not show the same data again on each row.
- Escape each dynamic value with `esc()` before you put it into HTML.

### Errors, loading and feedback (mandatory)

Each screen and each action must handle loading, success and all failures. Do not leave a blank screen, an endless loader or raw error text.

**Requests**
- Call the backend only with `api()` in `attendance-app.js`. Do not write a second fetch wrapper.
- `api()` turns a network failure into a readable message (`err.network`). It also turns the server `detail` into the message.
- If you need the HTTP status code, add `err.status` in `api()` one time. Then use it everywhere.
- Ignore old answers when the user changes a filter quickly. Use a request number, as `loadReport()` does with `seq`.

**Loading**
- Show a loader at once when a request starts. Use `skeletonRows()` and `.rpSkel` for lists. Add a short status text, for example "Loading the report…".
- Disable the buttons that need the data (for example "Excel") until the data is loaded.
- Prevent a second submit while an action runs.

**Failures**

| Failure | What to show |
|---|---|
| No network | Error state with "Try again". Keep the filters. Show the last load time if you have it. |
| 401 (session ended) | Send the user to the sign-in screen. Tell them to sign in again. |
| 403 (no access) | A clear message, for example "You have no access to this location". No "Try again". |
| 404 (not found) | A "not found" state with a way back (for example to the list). No "Try again" loop. |
| 400, 409, 422 (bad or conflicting input) | The server message next to the form or action. Keep the values that the user typed. |
| 500 and other server errors | Error state with "Try again". |

- Use `emptyState()` and `reportError()` for these states. Use the tone `rpError` for errors.
- Do not show raw JSON, stack traces or internal names to the user.
- Do not catch an error and do nothing. If you must ignore an error, write a comment that tells why.

**Empty**
- When a request succeeds but has no data, show an empty state that tells why. Give a next step if one exists (for example "Go to today").

**Toasts**
- Use `toast(text)` to confirm a finished action: saved, checked in, checked out, downloaded.
- Keep the text short and specific, for example "Excel file is ready · guardian-attendance-2026-11-14.xlsx".
- Do not use a toast for a failure that stops the user. Use the error state or the error banner from `message()`.
- Do not show a toast when a screen only loads data.

**Backend**
- Return `HTTPException` with the correct code and a readable `detail`: 400 bad input, 401 not signed in, 403 no access, 404 not found, 409 conflict. FastAPI returns 422 for invalid fields.
- Do not return 500 for a user error. Do not put internal details in the message.

**Tests**
- Test the error codes of each new or changed endpoint: 401, 403, 404 and invalid input. See `tests/test_report_summary.py`.

## 5. UI theme and existing components

- Use only the colour tokens in `:root` of `attendance-app.css` and the colours in `docs/UI-GUIDE.md`. Do not add new colours without a reason.
- Before you add a component, look for one in `docs/UI-GUIDE.md`. Use the existing CSS classes and template functions.
- If a new screen needs its own classes, give them a short prefix. For example, the Reports screen uses `rp` (`.rpList`, `.rpSheet`).
- Do not add frameworks, build steps or libraries from a CDN.

### Figma

- The Figma file is the visual reference. The link is in `docs/UI-GUIDE.md`.
- Before you change a screen, read the related Figma screen. Use your own Figma connection.
- If you have no Figma access, use `docs/UI-GUIDE.md`. Tell the collaborator that you did not read Figma.
- Do not change the Figma file unless the collaborator asks.
- If your code is different from the Figma design, tell the collaborator.

## 6. Tests (mandatory)

- Add tests for each backend change. Use unit tests for functions and API tests for endpoints.
- Put tests in `tests/`. Use the existing pattern: `DATABASE_URL=sqlite:///:memory:`, `TestClient(app)` and an `auth()` helper. See `tests/test_report_summary.py`.
- Make sure that tests do not depend on their order. All test files share one in-memory database. Remove the data that your test adds, or check the change (before and after), not exact totals.
- Install the test packages from `requirements-dev.txt`.
- Run all tests and Ruff before each commit:
  ```bash
  python -m pytest -q tests/
  python -m ruff check .
  python -m ruff format --check .
  ```
- GitHub Actions runs the same checks for each pull request (`.github/workflows/ci.yml`). Do not merge when CI fails.
- Tell the collaborator the real result. If a test fails or does not run, say so.
- Browser tests (Playwright) are optional. They skip when Playwright is not installed.

## 7. Code rules

- Python: obey `ruff.toml`. JavaScript and CSS: obey `.prettierrc.json`.
- Use only parameterized SQL.
- Do role and location checks on the server. Use `scoped_sql()`, `scope_params()` and `require_location_access()` in `backend/demo_app.py`.
- Do not put real employee or client data in the repository. Demo data is fictional.
- Do not put secrets, passwords or tokens in the repository.

## 8. Work log (mandatory)

At the end of each task, add an entry at the top of `docs/WORKLOG.md`. Use the template in that file. Put the entry in the same commit as the work.

## 9. Commits and pull requests

- Write the message in STE100.
- Make small commits. Put one change in one commit.
- In the pull request text, tell what changed, why, and the test result. Fill in `.github/pull_request_template.md`.
