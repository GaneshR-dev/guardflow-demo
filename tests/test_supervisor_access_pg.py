"""PostgreSQL-backed verification of supervisor access management.

Production runs on PostgreSQL, where behaviour differs from SQLite (row locking,
outer-join rules, connection isolation). This module boots a real embedded
PostgreSQL (pgserver wheel) in a subprocess and exercises the migration and the
auth/session/grant flows against it. Skipped wherever pgserver or psycopg is not
installed (CI included); run locally with: pip install pgserver 'psycopg[binary]'
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

pgserver = pytest.importorskip("pgserver", reason="embedded PostgreSQL not installed")
pytest.importorskip("psycopg", reason="psycopg driver not installed")

REPO = Path(__file__).resolve().parent.parent

FLOW = r"""
import sys
sys.path.insert(0, "backend")
from fastapi.testclient import TestClient
from demo_app import app
from demo_db import engine, migrate_db
from sqlalchemy import text

client = TestClient(app)

def auth(u="admin.demo", p="demo123"):
    r = client.post("/api/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}

# Boot migration ran on PostgreSQL; a second migration is a no-op.
with engine.begin() as c:
    assert c.execute(
        text("SELECT 1 FROM information_schema.tables WHERE table_name='demo_disabled_users'")
    ).first()
migrate_db()

# Pre-existing users (no marker rows) keep working.
assert client.get("/api/locations", headers=auth()).status_code == 200

# Grant edit: enforced on the supervisor's very next request.
client.post(
    "/api/settings/access",
    headers=auth(),
    json={
        "id": "sup.pg",
        "name": "PG Supervisor",
        "password": "temporary-pass-1",
        "role": "supervisor",
        "location_ids": ["loc-hsr"],
    },
)
sup = auth("sup.pg", "temporary-pass-1")
assert [loc["id"] for loc in client.get("/api/locations", headers=sup).json()] == ["loc-hsr"]
r = client.patch(
    "/api/settings/access/sup.pg/locations", headers=auth(), json={"location_ids": ["loc-whitefield"]}
)
assert r.status_code == 200, r.text
assert client.get("/api/attendance?location_id=loc-hsr", headers=sup).status_code == 403
assert client.get("/api/attendance?location_id=loc-whitefield", headers=sup).status_code == 200

# Disable: old token revoked, sign-in blocked; enable restores coverage but the
# pre-disable token stays revoked (sessions are gone, not just gated).
old_token = sup
assert client.delete("/api/settings/access/sup.pg", headers=auth()).status_code == 200
assert client.get("/api/locations", headers=old_token).status_code in (401, 403)
assert client.post("/api/login", json={"username": "sup.pg", "password": "temporary-pass-1"}).status_code == 403

# Backstop: a session that survives revocation is still rejected on every request.
assert client.post("/api/settings/access/sup.pg/enable", headers=auth()).status_code == 200
sup2 = auth("sup.pg", "temporary-pass-1")
with engine.begin() as c:
    c.execute(text("INSERT INTO demo_disabled_users VALUES ('sup.pg','2026-11-15T00:00:00+00:00','admin.demo')"))
assert client.get("/api/locations", headers=sup2).status_code == 403
with engine.begin() as c:
    c.execute(text("DELETE FROM demo_disabled_users WHERE user_id='sup.pg'"))
assert client.get("/api/locations", headers=old_token).status_code in (401, 403)
assert client.get("/api/locations", headers=auth("sup.pg", "temporary-pass-1")).status_code == 200
print("PG FLOWS OK")
"""


def test_postgresql_migration_and_access_flows(tmp_path):
    server = pgserver.get_server(str(tmp_path / "pgdata"))
    uri = server.get_uri().replace("postgresql://", "postgresql+psycopg://")
    env = dict(os.environ, DATABASE_URL=uri, DEMO_MODE="true")
    result = subprocess.run(
        [sys.executable, "-c", FLOW], check=False, env=env, cwd=REPO, capture_output=True, text=True, timeout=180
    )
    assert result.returncode == 0, result.stderr[-3000:]
    assert "PG FLOWS OK" in result.stdout
