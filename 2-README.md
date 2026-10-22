# Guardflow
Mobile-first security-personnel operations demo and an API foundation.

## Public demo
Fictional company, people and rates. Browser-local data, not a live shared service.
Open `web/index.html` through any static web server. No build step or paid service.
`python3 -m http.server 8765 --directory web`

Working: named attendance, whole-shift relief assignment, duplicate assignment checks,
paper headcount reconciliation, optional local photo evidence, in-app mismatch log,
named daily earnings, headcount billing draft, CSV/JSON export, role screen previews,
offline caching, mobile navigation and append-only-in-UI activity history.

Invoice layout remains provisional until the owner's sample arrives. No tax/GST,
PF/ESI, overtime, split-shift pay, deductions, month-end billing or payments implemented.
Daily rates and 12-hour shifts are demo assumptions, not labour/payroll guidance.

## API foundation (not connected to static demo)
Python FastAPI + SQLAlchemy. SQLite for local tests; PostgreSQL connection via DATABASE_URL.
`python3 -m pip install -r backend/requirements.txt`
`cd backend && python3 manage.py` creates an owner using a terminal password prompt.
`python3 -m uvicorn app:app --host 127.0.0.1 --port 8000`
No default production credentials. No real data bundled. Server stores hashed passwords
and session tokens. Per-site scope checks, role checks, integer paise accounting,
optimistic version conflicts and an audit trail are implemented and tested locally.

This is a FOUNDATION, not a production-ready backend. Production blockers:
- Connect UI to API with secure cookies / CSRF protection and robust offline sync.
- Build site/shift/employee administration, rate ownership and assignment locks.
- Implement persistent evidence storage with access-controlled upload validation.
- Enforce database-level append-only audit permissions and serializable assignments.
- Set up alert delivery, recovery, backups, restore drills and owner onboarding.
- Implement finalisation/adjustment approvals and exact invoice template.
- Verify regional employment, tax and payroll rules with the company.
- Test PostgreSQL deployment and Safari/iPhone on a real device.

Do not expose this API to the internet until these are addressed. Public demo uses no API.

## Tests
`npm ci && npx playwright test` (Chrome at /usr/bin/google-chrome)
`python3 -m pytest tests/test_api.py -q`
UI tests cover all 8 screens at 320px, 390px, 1280px, replacements, reconciliation,
persistence, empty search, role preview, draft billing and payroll blocking.
API tests cover authentication, site scope, employee privacy, conflicts, pay, register
reconciliation, audit records and login rate limiting.

## Safety
Never enter real guard data into the public demo. No SMS, WhatsApp or payment is sent.
Backups are add-only dated archives. Code must not be removed without owner approval.
