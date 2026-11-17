# Guardian attendance

Mobile-first guard attendance app ("Guardian", formerly "GuardFlow") with a FastAPI backend and PostgreSQL database. Built for a manpower/security company pilot: named-guard attendance per client site, replacements, register reconciliation and draft billing.

## Live deployment

- App: https://guardflow-demo.ethiodeploy.app/app (frontend, API and PostgreSQL on one platform)
- The live database currently holds no attendance records (cleared at the owner's request); only the demo sign-in accounts remain. No real employee or client records.
- Demo credentials are intentionally visible on the sign-in screen (`admin.demo`, `supervisor.demo`, each with password `demo123`).
- The earlier device-local GitHub Pages demo (ganeshr-dev.github.io/guardflow-demo) was unpublished on 2026-11-13; Git history is preserved.
- A local run behaves differently: it seeds fictional sample history automatically (see Run locally).

## Repository layout

- `attendance-app.html` - current frontend shell (mobile-first), served at `/app`.
- `attendance-app.css` / `attendance-app.js` - frontend styles and logic, extracted from the shell and served alongside it.
- `frontend/` - new React + TypeScript frontend (Vite, Tailwind, shadcn/ui). It is built to `frontend/dist` and served at `/next`. The screens move here one at a time.
- `backend/demo_app.py` - current API (FastAPI + SQLAlchemy; SQLite locally, PostgreSQL via `DATABASE_URL`).
- `tests/` - API and frontend regression tests.

The earlier API foundation (`backend/app.py`, its `backend/manage.py` bootstrap and `tests/test_api.py`) was retired on 2026-11-14; it remains in Git history.

Earlier demo files and archives were removed from the working tree on 2026-11-13; everything remains in Git history.

## Stack

Vanilla JavaScript frontend served by the backend at `/app`, Python FastAPI + SQLAlchemy API, PostgreSQL in deployment, SQLite for local development and tests.

## Run locally

Requires Python 3.10+. Run all commands from the repository root:

```bash
python3 -m pip install -r backend/requirements.txt
python3 -m uvicorn backend.demo_app:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/app` and sign in with one of the demo accounts shown on the sign-in screen. A local SQLite database with fictional sample history is created automatically on first run.

### New React frontend

Requires Node 22.12 or later (`frontend/.nvmrc`). Start the API first (see above), then:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/next/`. The dev server sends `/api` requests to the API on port 8000.

To let FastAPI serve the new app at `http://127.0.0.1:8000/next`, run `npm run build` in `frontend/`.

## Test

From the repository root:

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m pytest -q tests/
python3 -m ruff check . && python3 -m ruff format --check .
```

For the React frontend:

```bash
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

Browser tests use Playwright. They skip when Playwright is not installed (see `requirements-dev.txt`). GitHub Actions runs the tests and Ruff for each pull request (`.github/workflows/ci.yml`).

Covers login (including throttling and server-side logout revocation), scoped locations, dashboard, check-in/check-out, duplicate prevention, employee creation/import with validation and rollback, reports with computed hours, settings, permissions and six-month sample history.

## Logs

The API writes application logs as JSON lines to the console (stderr): one line for each `/api/*` request, sign-in events and server errors with the stack trace. Each response has an `X-Request-ID` header that matches its log line.

- Local: the logs show in the terminal that runs `uvicorn`.
- Live: the ethiodeploy dashboard shows the console output.
- `LOG_LEVEL` sets the level (default `INFO`). The logs never hold passwords, tokens, names or request bodies.
- Business actions (who changed what) are in the audit table. Admins see them in Settings > Activity log.

## Working with AI tools

Collaborators work in this repository through AI tools. Each AI tool must obey these files:

- `AGENTS.md`: rules for all AI tools (ASD-STE100, UX, UI theme, tests, commits). `CLAUDE.md` loads it for Claude Code.
- `docs/UI-GUIDE.md`: colour tokens and existing components.
- `docs/GLOSSARY.md`: the words for app text and what each word means.
- `docs/WORKLOG.md`: one entry for each task, newest first.

## Security notes

- HTML escaping on all dynamic values rendered by the frontend; parameterized SQL throughout the backend.
- scrypt password hashing; sessions stored as SHA-256 digests with expiry; sign-out revokes the server session.
- Login attempts are throttled after repeated failures (per user ID, configurable via `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_SECONDS`).
- Supervisor users are scoped through `demo_user_locations`; admins see every location. Role and location checks are enforced server-side.
- This is a working pilot, not production-hardened. Do not load real employee records yet.

## Demo data safety

Seeded attendance is fictional and marked in the `source` field. Demo users are seeded by default only for local SQLite; for a deployed demo set `DEMO_MODE=true` deliberately. With `DEMO_MODE=false` against PostgreSQL the visible demo credentials are never created.

## Demo roles and landing page

Admins open Attendance overview after sign-in. Supervisors open Mark attendance. Both roles use one bottom taskbar. Admins can add/import locations and employees. Supervisors can view employees and assigned locations, and continue to record check-ins/check-outs within their existing location scope. The API enforces creation/import permissions as well as the UI.

Startup retires only the original, unchanged `demo` sign-in identity and its sessions/location grants from existing databases. Employee records, attendance and audit history are preserved. Customized accounts are not removed automatically.

## Sequential shifts

An employee can have only one open check-in across all locations. Check out before starting another shift.
A second shift shows a warning to the person marking attendance. They must confirm before the new check-in is saved.
Each shift keeps a separate record. Attendance shows the latest shift at each site. Reports and exports keep all shifts.
The overview counts people rather than counting the same employee once per shift.

The database upgrade removes the old one-record-per-employee-per-day limit. It preserves existing attendance and open duties.
After multiple shifts are saved, fix issues by moving forward. Older application versions assume only one record per day.
