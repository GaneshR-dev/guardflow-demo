"""PostgreSQL checks for the functional multi-company scope: migration of a single-company
database keeps every record, company details are additive, password reset permissions and
session revocation hold, and the demo seeder never touches another company.
Skipped when pgserver/psycopg are not installed. All names and details here are fictional."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

pgserver = pytest.importorskip("pgserver", reason="embedded PostgreSQL not installed")
pytest.importorskip("psycopg", reason="psycopg driver not installed")
REPO = Path(__file__).resolve().parent.parent

FLOW = r"""
import hashlib, sys
sys.path.insert(0, "backend")
sys.path.insert(0, "scripts")
from fastapi.testclient import TestClient
from demo_app import app
from demo_db import engine, migrate_db
from sqlalchemy import text

client = TestClient(app)

def login(u, p):
    return client.post("/api/login", json={"username": u, "password": p})

def auth(u, p):
    r = login(u, p)
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}

admin = auth("admin.demo", "demo123")
assert client.post("/api/settings/access", headers=admin, json={"id": "pg.sup", "name": "PG Sup", "password": "old-pass-1234", "role": "supervisor", "location_ids": ["loc-hsr"]}).status_code == 200

DATA = {
    "demo_users": "SELECT id,name,role,salt,password FROM demo_users ORDER BY id",
    "demo_locations": "SELECT id,name,area,assigned_count,shift_start,shift_end,active FROM demo_locations ORDER BY id",
    "demo_employees": "SELECT id,name,phone,role,location_id,active FROM demo_employees ORDER BY id",
    "demo_attendance": "SELECT id,employee_id,location_id,day,status,check_in,check_out,source FROM demo_attendance ORDER BY id",
    "demo_user_locations": "SELECT user_id,location_id FROM demo_user_locations ORDER BY 1,2",
}
def snap(c):
    return {k: hashlib.sha256(repr([tuple(r) for r in c.execute(text(q))]).encode()).hexdigest() for k, q in DATA.items()}

# Put the database back into its single-company shape (no company tables or columns).
with engine.begin() as c:
    c.execute(text("DROP INDEX IF EXISTS demo_one_owner"))
    for t in ("demo_users", "demo_locations", "demo_employees"):
        c.execute(text(f"ALTER TABLE {t} DROP COLUMN IF EXISTS company_id"))
    c.execute(text("DROP TABLE IF EXISTS demo_audit_scope"))
    c.execute(text("DROP TABLE IF EXISTS demo_companies"))
    before = snap(c)
    counts = {k: c.execute(text(f"SELECT count(*) FROM {k}")).scalar() for k in DATA}

migrate_db()
migrate_db()  # idempotent
with engine.begin() as c:
    assert snap(c) == before, "existing records changed by migration"
    assert counts == {k: c.execute(text(f"SELECT count(*) FROM {k}")).scalar() for k in DATA}
    companies = c.execute(text("SELECT id,name,address,contact_person,contact_phone FROM demo_companies")).all()
    assert len(companies) == 1 and companies[0][1] == "Professional Manpower Services", companies
    assert companies[0][2:] == (None, None, None), "no details may be invented"
    for t in ("demo_users", "demo_locations", "demo_employees"):
        assert c.execute(text(f"SELECT count(*) FROM {t} WHERE company_id IS NULL AND role<>'owner'" if t == "demo_users" else f"SELECT count(*) FROM {t} WHERE company_id IS NULL")).scalar() == 0
print("PG MIGRATION KEEPS RECORDS OK")

# Reset permissions and session revocation.
admin = auth("admin.demo", "demo123")
sup = auth("pg.sup", "old-pass-1234")
assert client.post("/api/settings/access/pg.sup/password", headers=sup, json={"password": "nope-nope-123"}).status_code == 403
assert client.post("/api/settings/access/admin.demo/password", headers=admin, json={"password": "new-admin-pass1"}).status_code == 400
assert client.post("/api/settings/access/pg.sup/password", headers=admin, json={"password": "short"}).status_code == 422
assert client.post("/api/settings/access/pg.sup/password", headers=admin, json={"password": "fresh-pass-9876"}).status_code == 200
assert client.get("/api/locations", headers=sup).status_code == 401
assert login("pg.sup", "old-pass-1234").status_code == 401
assert login("pg.sup", "fresh-pass-9876").status_code == 200
print("PG RESET PERMISSIONS OK")

# Seeder: dry run changes nothing, apply adds only the demo company, second apply is refused.
import seed_demo_company as sd
with engine.connect() as c:
    fp0 = sd.fingerprint(c)
    d0 = snap(c)
with engine.connect() as c:
    tx = c.begin(); sd.seed(c, None); assert sd.fingerprint(c) == fp0; tx.rollback()
with engine.connect() as c:
    assert snap(c) == d0 and c.execute(text("SELECT count(*) FROM demo_companies")).scalar() == 1
import tempfile
with engine.connect() as c:
    tx = c.begin(); summary = sd.seed(c, tempfile.mkdtemp()); assert sd.fingerprint(c) == fp0; tx.commit()
with engine.connect() as c:
    assert sd.fingerprint(c) == fp0
    assert c.execute(text("SELECT count(*) FROM demo_companies")).scalar() == 2
    assert snap(c) != d0  # demo rows were added
    for k, q in DATA.items():
        pass
    orig = c.execute(text("SELECT count(*) FROM demo_attendance a JOIN demo_locations l ON l.id=a.location_id WHERE l.company_id='company-1'")).scalar()
    assert orig == counts["demo_attendance"], (orig, counts)
print("PG SEEDER ISOLATION OK", summary["attendance_rows"])
"""

OWNER_FLOW = r"""
import sys
sys.path.insert(0, "backend")
from fastapi.testclient import TestClient
from demo_app import app
from demo_db import engine
from sqlalchemy import text

client = TestClient(app)

def auth(u, p):
    r = client.post("/api/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}

assert client.post("/api/owner/setup", json={"token": "wrong-token-123", "id": "pg.owner", "name": "PG Owner", "password": "owner-pass-12345"}).status_code == 403
assert client.post("/api/owner/setup", json={"token": "pg-setup-token-1", "id": "pg.owner", "name": "PG Owner", "password": "owner-pass-12345"}).status_code == 200
owner = auth("pg.owner", "owner-pass-12345")
admin = auth("admin.demo", "demo123")
cid = client.post("/api/owner/companies", headers=owner, json={"name": "PG Other Co"}).json()["id"]
adm2 = client.post(f"/api/owner/companies/{cid}/admins", headers=owner, json={"id": "pg.admin2", "name": "PG Admin Two", "password": "admin-pass-12345"})
assert adm2.status_code in (200, 201), adm2.text
adm2 = auth("pg.admin2", "admin-pass-12345")
with engine.connect() as c:
    first = c.execute(text("SELECT id FROM demo_companies WHERE name='Professional Manpower Services'")).scalar()
    other_before = c.execute(text("SELECT count(*) FROM demo_employees WHERE company_id=:c"), {"c": first}).scalar()
body = {"name": "Professional Manpower Services", "address": "1 Fictional Road", "contact_person": "Fictional Person", "contact_phone": "000"}
# Only the owner may edit; company admins, supervisors and anonymous callers are refused.
for hdr in (admin, adm2, {}):
    assert client.patch(f"/api/owner/companies/{cid}", headers=hdr, json=body).status_code in (401, 403)
assert client.patch("/api/owner/companies/no-such-company", headers=owner, json=body).status_code == 404
assert client.patch(f"/api/owner/companies/{cid}", headers=owner, json={"name": "PG Other Co", "address": "2 Fictional Lane"}).status_code == 200
with engine.connect() as c:
    rows = {r[0]: r[1:] for r in c.execute(text("SELECT id,name,address,contact_person,contact_phone FROM demo_companies"))}
    assert rows[cid] == ("PG Other Co", "2 Fictional Lane", None, None), rows[cid]
    assert rows[first] == ("Professional Manpower Services", None, None, None), "first company must not change"
    assert c.execute(text("SELECT count(*) FROM demo_employees WHERE company_id=:c"), {"c": first}).scalar() == other_before
listing = client.get("/api/owner/companies", headers=owner).json()["companies"]
assert next(x for x in listing if x["id"] == cid)["address"] == "2 Fictional Lane"
assert client.get("/api/owner/companies", headers=admin).status_code in (401, 403)
print("PG OWNER PATCH OK")
"""


def test_postgresql_functional_scope(tmp_path):
    server = pgserver.get_server(str(tmp_path / "pgfunc"))
    uri = server.get_uri().replace("postgresql://", "postgresql+psycopg://")
    env = dict(os.environ, DATABASE_URL=uri, DEMO_MODE="true")
    result = subprocess.run(
        [sys.executable, "-c", FLOW], check=False, env=env, cwd=REPO, capture_output=True, text=True, timeout=240
    )
    assert result.returncode == 0, result.stderr[-3000:]
    for marker in ("PG MIGRATION KEEPS RECORDS OK", "PG RESET PERMISSIONS OK", "PG SEEDER ISOLATION OK"):
        assert marker in result.stdout


def test_postgresql_owner_company_details_authorization(tmp_path):
    server = pgserver.get_server(str(tmp_path / "pgowner"))
    uri = server.get_uri().replace("postgresql://", "postgresql+psycopg://")
    env = dict(os.environ, DATABASE_URL=uri, DEMO_MODE="true", OWNER_SETUP_TOKEN="pg-setup-token-1")
    result = subprocess.run(
        [sys.executable, "-c", OWNER_FLOW], check=False, env=env, cwd=REPO, capture_output=True, text=True, timeout=240
    )
    assert result.returncode == 0, result.stderr[-3000:]
    assert "PG OWNER PATCH OK" in result.stdout
