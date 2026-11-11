# Guardian attendance

Mobile-first Guardian attendance demo for the supplied Figma design, with a FastAPI backend and fictional sample history.

## Current entry points

- `attendance-flow.html` remains the previously delivered live demo. Do not replace it until the backend-hosted replacement is verified.
- `attendance-app.html` is the new Figma-led app. It includes login, location selection, attendance, employee check-in, confirmation, check-out, admin dashboard, navigation, employees, reports and settings.
- `backend/app.py` is the earlier security/audit API foundation.
- `backend/demo_app.py` serves the new app API and seeds clearly fictional sample data across the last six months.

## Stack

Approved plan: React PWA-style mobile frontend, Python FastAPI, SQLAlchemy, PostgreSQL for deployment, and free Cloudflare Tunnel from the office PC. Local development uses SQLite unless `DATABASE_URL` points to PostgreSQL.

## Run locally

```bash
python3 -m pip install -r backend/requirements.txt
cd backend
python3 -m uvicorn demo_app:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/app`.

Demo credentials are intentionally visible on the login screen:

- `admin.demo` / `demo123`
- `supervisor.demo` / `demo123`
- `demo` / `demo123`

## Test

```bash
python3 -m pytest -q tests/test_api.py tests/test_demo_app.py
```

The tests cover the original API foundation plus the new login, scoped locations, dashboard, check-in, duplicate-check-in prevention, check-out, employee creation/import validation and rollback, employee-level reports with computed hours, settings persistence, permissions and six-month sample history endpoints.

## Demo data safety

The Guardian sample backend uses `demo_` tables and marks seeded attendance as fictional. Demo users are seeded by default only for SQLite local development. When `DATABASE_URL` points at PostgreSQL, set `DEMO_MODE=true` only for a deliberate demo environment; otherwise the visible demo credentials are not created and cannot grant access to a production database.

Supervisor users are scoped through `demo_user_locations`; admins see every location. Settings supports persisted profile updates, admin location creation and admin supervisor creation with location grants.

## Deployment gap

The approved live route is PostgreSQL on the office PC exposed through Cloudflare Tunnel. This workspace has verified the app only on local SQLite. A live backend still needs the actual office-PC or another approved free host, PostgreSQL database, tunnel DNS and HTTPS URL before the public frontend should switch from browser-local fallback to the live API.
