# Guardian attendance

Mobile-first guard attendance app ("Guardian", formerly "GuardFlow") with a FastAPI backend and PostgreSQL database. Built for a manpower/security company pilot: named-guard attendance per client site, replacements, register reconciliation and draft billing.

## Live deployment

- App: https://guardflow-demo.ethiodeploy.app/app (frontend, API and PostgreSQL on one platform)
- The live database currently holds no attendance records (cleared at the owner's request); only the demo sign-in accounts remain. No real employee or client records.
- Demo credentials are intentionally visible on the sign-in screen (`admin.demo`, `supervisor.demo`, each with password `demo123`).
- The earlier device-local GitHub Pages demo (ganeshr-dev.github.io/guardflow-demo) was unpublished on 2026-11-13; Git history is preserved.
- A local run behaves differently: it seeds fictional sample history automatically (see Run locally).

## Repository layout

- `attendance-app.html` - current frontend (HTML/CSS/vanilla JavaScript, mobile-first).
- `backend/demo_app.py` - current API (FastAPI + SQLAlchemy; SQLite locally, PostgreSQL via `DATABASE_URL`).
- `backend/app.py` - earlier API foundation, kept for reference.
- `tests/` - API and frontend regression tests.

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

## Test

From the repository root:

```bash
python3 -m pip install pytest
python3 -m pytest -q tests/
```

Covers login (including throttling and server-side logout revocation), scoped locations, dashboard, check-in/check-out, duplicate prevention, employee creation/import with validation and rollback, reports with computed hours, settings, permissions and six-month sample history.

## Security notes

- HTML escaping on all dynamic values rendered by the frontend; parameterized SQL throughout the backend.
- scrypt password hashing; sessions stored as SHA-256 digests with expiry; sign-out revokes the server session.
- Login attempts are throttled after repeated failures (per user ID, configurable via `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_SECONDS`).
- Supervisor users are scoped through `demo_user_locations`; admins see every location. Role and location checks are enforced server-side.
- This is a working pilot, not production-hardened. Do not load real employee records yet.

## Demo data safety

Seeded attendance is fictional and marked in the `source` field. Demo users are seeded by default only for local SQLite; for a deployed demo set `DEMO_MODE=true` deliberately. With `DEMO_MODE=false` against PostgreSQL the visible demo credentials are never created.

## Demo roles and landing page

Both built-in accounts open the attendance/check-in page after sign-in and location selection. Admins can add/import locations and employees. Supervisors can view employees and assigned locations, and continue to record check-ins/check-outs within their existing location scope. The API enforces creation/import permissions as well as the UI.

Startup retires only the original, unchanged `demo` sign-in identity and its sessions/location grants from existing databases. Employee records, attendance and audit history are preserved. Customized accounts are not removed automatically.
