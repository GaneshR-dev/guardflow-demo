"""PostgreSQL-backed verification of supervisor access management.

Production runs on PostgreSQL, where behaviour differs from SQLite (row locking,
outer-join rules, connection isolation). This module boots a real embedded
PostgreSQL (pgserver wheel) in a subprocess and exercises the migration and the
auth/session/grant flows against it. Skipped wherever pgserver or psycopg is not
installed (CI included); run locally with: pip install pgserver 'psycopg[binary]'

Three proofs: sequential migration/auth/grant flows, forced concurrent races
(login vs disable, concurrent grant edits) with pg_locks evidence that the loser
physically queued on the user row lock, and a populated legacy-schema upgrade
that preserves every pre-existing record.
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


RACE_FLOW = r"""
import sys
import threading
import time

sys.path.insert(0, "backend")
from fastapi.testclient import TestClient

import demo_app
from demo_app import app
from demo_db import engine
from sqlalchemy import text

client = TestClient(app)


def auth(u="admin.demo", p="demo123"):
    r = client.post("/api/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def make_sup(uid):
    r = client.post(
        "/api/settings/access",
        headers=auth(),
        json={"id": uid, "name": "Race Sup", "password": "temporary-pass-1", "role": "supervisor", "location_ids": ["loc-hsr"]},
    )
    assert r.status_code == 200, r.text


def wait_for_lock_waiter():
    # Deterministic proof a second transaction physically queued on a row lock.
    with engine.connect() as c:
        for _ in range(100):
            if c.execute(text("SELECT count(*) FROM pg_locks WHERE NOT granted")).scalar():
                return True
            time.sleep(0.1)
    return False


admin = auth()
make_sup("sup.race")
pre_disable = auth("sup.race", "temporary-pass-1")

# Forced login-vs-disable race: the login pauses inside its transaction after locking
# the user row and passing the marker check, right before the session insert. Disable
# must queue on that lock; once the login commits, disable deletes the fresh session
# in the same transaction that writes the marker.
started = threading.Event()
resume = threading.Event()
armed = {"login": False}
orig_token = demo_app.secrets.token_urlsafe


def paused_token(n):
    if armed["login"]:
        armed["login"] = False
        started.set()
        assert resume.wait(30)
    return orig_token(n)


results = {}


def t_login():
    results["login"] = TestClient(app).post(
        "/api/login", json={"username": "sup.race", "password": "temporary-pass-1"}
    )


def t_disable():
    results["disable"] = TestClient(app).delete("/api/settings/access/sup.race", headers=admin)


demo_app.secrets.token_urlsafe = paused_token
armed["login"] = True
tl = threading.Thread(target=t_login)
tl.start()
assert started.wait(30), "login never reached the session insert point"
td = threading.Thread(target=t_disable)
td.start()
assert wait_for_lock_waiter(), "disable did not queue on the login's row lock: serialization absent"
resume.set()
tl.join(30)
td.join(30)
demo_app.secrets.token_urlsafe = orig_token
assert not tl.is_alive() and not td.is_alive(), "race threads did not finish"

assert results["login"].status_code == 200, results["login"].text
raced = results["login"].json()["token"]
assert results["disable"].status_code == 200, results["disable"].text

# The session minted mid-disable was deleted by the same transaction...
raced_headers = {"Authorization": "Bearer " + raced}
assert TestClient(app).get("/api/locations", headers=raced_headers).status_code in (401, 403)
# ...and enable cannot revive it: no late-token revival across the disable/enable cycle.
assert client.post("/api/settings/access/sup.race/enable", headers=admin).status_code == 200
assert TestClient(app).get("/api/locations", headers=raced_headers).status_code in (401, 403)
# The pre-disable session stays dead, enable purges anything left, and a fresh sign-in works.
assert TestClient(app).get("/api/locations", headers=pre_disable).status_code in (401, 403)
with engine.begin() as c:
    leftover = c.execute(text("SELECT count(*) FROM demo_sessions WHERE user_id='sup.race'")).scalar()
assert leftover == 0, leftover
assert client.get("/api/locations", headers=auth("sup.race", "temporary-pass-1")).status_code == 200
print("PG RACE LOGIN OK")

# Forced concurrent replace-all grant edits: the first edit pauses inside its transaction
# holding the user row lock; the second must queue until the first commits. The persisted
# grants are exactly the last committer's set - never a union, never a unique violation.
make_sup("sup.grants")
p_started = threading.Event()
p_resume = threading.Event()
p_armed = {"on": False}
orig_grants = demo_app.grant_site_ids


def paused_grants(c, uid):
    if p_armed["on"]:
        p_armed["on"] = False
        p_started.set()
        assert p_resume.wait(30)
    return orig_grants(c, uid)


def t_patch1():
    results["p1"] = TestClient(app).patch(
        "/api/settings/access/sup.grants/locations", headers=admin, json={"location_ids": ["loc-hsr"]}
    )


def t_patch2():
    results["p2"] = TestClient(app).patch(
        "/api/settings/access/sup.grants/locations", headers=admin, json={"location_ids": ["loc-whitefield"]}
    )


demo_app.grant_site_ids = paused_grants
p_armed["on"] = True
tp1 = threading.Thread(target=t_patch1)
tp1.start()
assert p_started.wait(30), "first grant edit never reached its pause point"
tp2 = threading.Thread(target=t_patch2)
tp2.start()
assert wait_for_lock_waiter(), "second grant edit did not queue on the first edit's row lock"
p_resume.set()
tp1.join(30)
tp2.join(30)
demo_app.grant_site_ids = orig_grants
assert not tp1.is_alive() and not tp2.is_alive(), "grant race threads did not finish"
assert results["p1"].status_code == 200, results["p1"].text
assert results["p2"].status_code == 200, results["p2"].text
with engine.begin() as c:
    persisted = [
        r[0]
        for r in c.execute(
            text("SELECT location_id FROM demo_user_locations WHERE user_id='sup.grants' ORDER BY 1")
        )
    ]
assert persisted == ["loc-whitefield"], persisted
print("PG RACE GRANTS OK")

# Forced concurrent disables (the independently reproduced collision): the first
# disable pauses holding the user row lock; the second must queue, then read the
# marker FRESH after lock acquisition and fail 404 - not duplicate-insert on a stale
# join snapshot and crash with a unique violation.
make_sup("sup.dd")
d_started = threading.Event()
d_resume = threading.Event()
d_armed = {"on": False}


def paused_grants2(c, uid):
    if d_armed["on"]:
        d_armed["on"] = False
        d_started.set()
        assert d_resume.wait(30)
    return orig_grants(c, uid)


def t_disable1():
    results["d1"] = TestClient(app).delete("/api/settings/access/sup.dd", headers=admin)


def t_disable2():
    results["d2"] = TestClient(app).delete("/api/settings/access/sup.dd", headers=admin)


demo_app.grant_site_ids = paused_grants2
d_armed["on"] = True
tdd1 = threading.Thread(target=t_disable1)
tdd1.start()
assert d_started.wait(30), "first disable never reached its pause point"
tdd2 = threading.Thread(target=t_disable2)
tdd2.start()
assert wait_for_lock_waiter(), "second disable did not queue on the first disable's row lock"
d_resume.set()
tdd1.join(30)
tdd2.join(30)
demo_app.grant_site_ids = orig_grants
assert not tdd1.is_alive() and not tdd2.is_alive(), "disable race threads did not finish"
assert results["d1"].status_code == 200, results["d1"].text
assert results["d2"].status_code == 404, results["d2"].text
with engine.begin() as c:
    markers = c.execute(text("SELECT count(*) FROM demo_disabled_users WHERE user_id='sup.dd'")).scalar()
assert markers == 1, markers
print("PG RACE DISABLE-DISABLE OK")

# Enable/enable collision: the second enabler queues on the same lock and must read the
# post-cycle marker state fresh, failing 404 instead of double-enabling.
assert client.post("/api/settings/access/sup.dd/enable", headers=admin).status_code == 200
assert client.delete("/api/settings/access/sup.dd", headers=admin).status_code == 200
e_started = threading.Event()
e_resume = threading.Event()
e_armed = {"on": False}
orig_audit = demo_app.audit


def paused_audit(c, user, action, details):
    if e_armed["on"]:
        e_armed["on"] = False
        e_started.set()
        assert e_resume.wait(30)
    return orig_audit(c, user, action, details)


def t_enable1():
    results["e1"] = TestClient(app).post("/api/settings/access/sup.dd/enable", headers=admin)


def t_enable2():
    results["e2"] = TestClient(app).post("/api/settings/access/sup.dd/enable", headers=admin)


demo_app.audit = paused_audit
e_armed["on"] = True
tee1 = threading.Thread(target=t_enable1)
tee1.start()
assert e_started.wait(30), "first enable never reached its pause point"
tee2 = threading.Thread(target=t_enable2)
tee2.start()
assert wait_for_lock_waiter(), "second enable did not queue on the first enable's row lock"
e_resume.set()
tee1.join(30)
tee2.join(30)
demo_app.audit = orig_audit
assert not tee1.is_alive() and not tee2.is_alive(), "enable race threads did not finish"
assert results["e1"].status_code == 200, results["e1"].text
assert results["e2"].status_code == 404, results["e2"].text
assert client.get("/api/locations", headers=auth("sup.dd", "temporary-pass-1")).status_code == 200
print("PG RACE ENABLE-ENABLE OK")
"""

LEGACY_FLOW = r"""
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


# Populate the database with live records written through the current code.
admin = auth()
r = client.post(
    "/api/settings/access",
    headers=admin,
    json={
        "id": "sup.legacy",
        "name": "Legacy Sup",
        "password": "temporary-pass-1",
        "role": "supervisor",
        "location_ids": ["loc-hsr", "loc-mysuru"],
    },
)
assert r.status_code == 200, r.text
legacy_session = auth("sup.legacy", "temporary-pass-1")

# Stabilize migration-created seed rows first (an idempotent no-op on the current
# schema): demo_location_shifts is seeded by the migration once locations exist.
migrate_db()

# Simulate the pre-upgrade production state: the old schema (no marker table) holding
# real records. Snapshot every table, drop the marker table, run the upgrade.
with engine.begin() as c:
    tables = [
        r[0]
        for r in c.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'demo_%' AND table_name <> 'demo_disabled_users'")
        )
    ]
    counts_before = {t: c.execute(text(f"SELECT count(*) FROM {t}")).scalar() for t in tables}
    user_before = c.execute(
        text("SELECT id, name, role FROM demo_users WHERE id='sup.legacy'")
    ).mappings().first()
    grants_before = [
        r[0]
        for r in c.execute(text("SELECT location_id FROM demo_user_locations WHERE user_id='sup.legacy' ORDER BY 1"))
    ]
    assert any(counts_before.values()), "snapshot is empty - not a populated database"
    c.execute(text("DROP TABLE demo_disabled_users"))

migrate_db()

with engine.begin() as c:
    assert c.execute(
        text("SELECT 1 FROM information_schema.tables WHERE table_name='demo_disabled_users'")
    ).first(), "upgrade did not recreate the marker table"
    counts_after = {t: c.execute(text(f"SELECT count(*) FROM {t}")).scalar() for t in tables}
    user_after = c.execute(text("SELECT id, name, role FROM demo_users WHERE id='sup.legacy'")).mappings().first()
    grants_after = [
        r[0]
        for r in c.execute(text("SELECT location_id FROM demo_user_locations WHERE user_id='sup.legacy' ORDER BY 1"))
    ]
assert counts_before == counts_after, (counts_before, counts_after)
assert dict(user_before) == dict(user_after)
assert grants_before == grants_after == ["loc-hsr", "loc-mysuru"]

# The upgraded database is fully usable: old session still valid, new controls work.
assert client.get("/api/locations", headers=legacy_session).status_code == 200
assert client.delete("/api/settings/access/sup.legacy", headers=admin).status_code == 200
assert client.get("/api/locations", headers=legacy_session).status_code in (401, 403)
assert client.post("/api/settings/access/sup.legacy/enable", headers=admin).status_code == 200
print("PG LEGACY UPGRADE OK")
"""


def run_flow(tmp_path, script, marker, dirname):
    server = pgserver.get_server(str(tmp_path / dirname))
    uri = server.get_uri().replace("postgresql://", "postgresql+psycopg://")
    env = dict(os.environ, DATABASE_URL=uri, DEMO_MODE="true")
    result = subprocess.run(
        [sys.executable, "-c", script], check=False, env=env, cwd=REPO, capture_output=True, text=True, timeout=180
    )
    assert result.returncode == 0, result.stderr[-3000:]
    assert marker in result.stdout


def test_postgresql_migration_and_access_flows(tmp_path):
    run_flow(tmp_path, FLOW, "PG FLOWS OK", "pgdata")


def test_postgresql_forced_races(tmp_path):
    run_flow(tmp_path, RACE_FLOW, "PG RACE ENABLE-ENABLE OK", "pgrace")


def test_postgresql_legacy_upgrade_preserves_records(tmp_path):
    run_flow(tmp_path, LEGACY_FLOW, "PG LEGACY UPGRADE OK", "pglegacy")
