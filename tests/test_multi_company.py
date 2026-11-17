"""Multi-company isolation, owner-only admin creation, company pause, and migration backfill."""

import os
import sys

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import app
from demo_db import _migrate_schema, engine, unscoped_row_counts
from demo_security import insert_user
from fastapi.testclient import TestClient
from sqlalchemy import text

client = TestClient(app)
OWNER_PW = "owner-pass-12345"


def login(username, password):
    r = client.post("/api/login", json={"username": username, "password": password})
    return r


def bearer(username, password):
    r = login(username, password)
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def ensure_owner():
    with engine.begin() as c:
        if not c.execute(text("SELECT 1 FROM demo_users WHERE id='owner.test'")).first():
            insert_user(c, "owner.test", "Owner Test", "owner", OWNER_PW, None)
    return bearer("owner.test", OWNER_PW)


def make_company(owner, name):
    r = client.post("/api/owner/companies", headers=owner, json={"name": name})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def make_admin(owner, company_id, uid, pw="admin-pass-123"):
    r = client.post(
        f"/api/owner/companies/{company_id}/admins", headers=owner, json={"id": uid, "name": uid, "password": pw}
    )
    assert r.status_code == 200, r.text
    return bearer(uid, pw)


def test_backfill_leaves_nothing_unscoped():
    with engine.begin() as c:
        _migrate_schema(c)
        assert sum(unscoped_row_counts(c).values()) == 0


def test_existing_admin_stays_in_default_company():
    admin = bearer("admin.demo", "demo123")
    rows = client.get("/api/locations", headers=admin).json()
    assert any(loc["id"] == "loc-hsr" for loc in rows)


def test_only_owner_can_create_admins_and_admin_cannot():
    admin = bearer("admin.demo", "demo123")
    r = client.post(
        "/api/settings/access",
        headers=admin,
        json={"id": "sneaky.admin", "name": "Sneaky", "password": "sneaky-pass-1", "role": "admin", "location_ids": []},
    )
    assert r.status_code == 403
    # Admin cannot reach owner routes either.
    assert client.get("/api/owner/companies", headers=admin).status_code in (401, 403)
    assert client.post("/api/owner/companies", headers=admin, json={"name": "Nope Co"}).status_code in (401, 403)
    assert login("sneaky.admin", "sneaky-pass-1").status_code != 200


def test_multiple_admins_per_company_and_isolation():
    owner = ensure_owner()
    a = make_company(owner, "Alpha Security")
    b = make_company(owner, "Beta Guards")
    a1 = make_admin(owner, a, "alpha.one")
    a2 = make_admin(owner, a, "alpha.two")
    b1 = make_admin(owner, b, "beta.one")
    # Duplicate login ID is refused across companies.
    dup = client.post(
        f"/api/owner/companies/{b}/admins",
        headers=owner,
        json={"id": "alpha.one", "name": "Dup", "password": "dup-pass-1234"},
    )
    assert dup.status_code == 409
    # Alpha admin creates a branch and an employee; both admins of Alpha see them.
    loc = client.post(
        "/api/settings/locations",
        headers=a1,
        json={
            "id": "loc-alpha-1",
            "name": "Alpha Gate",
            "area": "North",
            "assigned_count": 1,
            "shift_start": "08:00",
            "shift_end": "16:00",
        },
    )
    assert loc.status_code in (200, 201), loc.text
    emp = client.post(
        "/api/employees",
        headers=a1,
        json={
            "id": "ALPHA-E1",
            "name": "Alpha Guard",
            "phone": "9111111111",
            "role": "Guard",
            "location_id": "loc-alpha-1",
        },
    )
    assert emp.status_code in (200, 201), emp.text
    assert any(x["id"] == "loc-alpha-1" for x in client.get("/api/locations", headers=a2).json())
    # Beta admin sees none of it, and the default company's admin neither.
    assert not any(x["id"] == "loc-alpha-1" for x in client.get("/api/locations", headers=b1).json())
    legacy = bearer("admin.demo", "demo123")
    assert not any(x["id"] == "loc-alpha-1" for x in client.get("/api/locations", headers=legacy).json())
    emps_b = client.get("/api/employees", headers=b1).json()
    emps_b = emps_b.get("rows", emps_b) if isinstance(emps_b, dict) else emps_b
    assert all(e["id"] != "ALPHA-E1" for e in emps_b)
    # Guessed IDs from another company are refused or hidden, never acted on.
    assert client.delete("/api/employees/ALPHA-E1", headers=b1).status_code in (403, 404)
    assert client.delete("/api/settings/locations/loc-alpha-1", headers=b1).status_code in (403, 404)
    assert client.put(
        "/api/settings/locations/loc-alpha-1/shifts", headers=b1, json={"shifts": [{"start": "01:00", "end": "02:00"}]}
    ).status_code in (403, 404, 422)
    still = client.get("/api/locations", headers=a1).json()
    assert any(x["id"] == "loc-alpha-1" for x in still)
    # Audit logs are per company.
    audit_b = client.get("/api/audit", headers=b1).json()
    assert "loc-alpha-1" not in str(audit_b)
    # Reports for Beta do not include Alpha.
    rep = client.get("/api/reports/summary", headers=b1)
    assert "ALPHA-E1" not in rep.text and "Alpha Guard" not in rep.text
    # Alpha admin cannot add a supervisor to a Beta branch.
    r = client.post(
        "/api/settings/access",
        headers=a1,
        json={
            "id": "alpha.sup",
            "name": "Alpha Sup",
            "password": "alpha-sup-123",
            "role": "supervisor",
            "location_ids": ["loc-hsr"],
        },
    )
    assert r.status_code in (400, 403, 404, 422)


def test_supervisor_keeps_assigned_location_limit_inside_company():
    owner = ensure_owner()
    c = make_company(owner, "Gamma Watch")
    adm = make_admin(owner, c, "gamma.admin")
    for lid in ("loc-g1", "loc-g2"):
        assert client.post(
            "/api/settings/locations",
            headers=adm,
            json={
                "id": lid,
                "name": lid,
                "area": "Zone",
                "assigned_count": 1,
                "shift_start": "08:00",
                "shift_end": "16:00",
            },
        ).status_code in (200, 201)
    r = client.post(
        "/api/settings/access",
        headers=adm,
        json={
            "id": "gamma.sup",
            "name": "Gamma Sup",
            "password": "gamma-sup-123",
            "role": "supervisor",
            "location_ids": ["loc-g1"],
        },
    )
    assert r.status_code in (200, 201), r.text
    sup = bearer("gamma.sup", "gamma-sup-123")
    ids = {x["id"] for x in client.get("/api/locations", headers=sup).json()}
    assert ids == {"loc-g1"}


def test_owner_needs_company_header_and_acts_inside_selected_company():
    owner = ensure_owner()
    c = make_company(owner, "Delta Patrol")
    adm = make_admin(owner, c, "delta.admin")
    client.post(
        "/api/settings/locations",
        headers=adm,
        json={
            "id": "loc-delta",
            "name": "Delta Gate",
            "area": "Zone",
            "assigned_count": 1,
            "shift_start": "08:00",
            "shift_end": "16:00",
        },
    )
    assert client.get("/api/locations", headers=owner).status_code == 400
    sel = client.get("/api/locations", headers={**owner, "X-Company-Id": c})
    assert sel.status_code == 200
    assert [x["id"] for x in sel.json()] == ["loc-delta"]
    # Owner actions are audited in that company.
    client.post(
        "/api/settings/locations",
        headers={**owner, "X-Company-Id": c},
        json={
            "id": "loc-delta-2",
            "name": "Delta Two",
            "area": "Zone",
            "assigned_count": 1,
            "shift_start": "08:00",
            "shift_end": "16:00",
        },
    )
    log = client.get("/api/audit", headers={**owner, "X-Company-Id": c}).text
    assert "loc-delta-2" in log
    # Unknown company is refused.
    assert client.get("/api/locations", headers={**owner, "X-Company-Id": "co-missing"}).status_code in (403, 404)


def test_pausing_company_blocks_login_and_sessions_and_preserves_data():
    owner = ensure_owner()
    c = make_company(owner, "Epsilon Guard")
    adm = make_admin(owner, c, "eps.admin")
    assert client.post(f"/api/owner/companies/{c}/disable", headers=owner).status_code == 200
    assert client.get("/api/locations", headers=adm).status_code in (401, 403)
    assert login("eps.admin", "admin-pass-123").status_code in (401, 403)
    with engine.begin() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM demo_users WHERE id='eps.admin'")).scalar() == 1
    assert client.post(f"/api/owner/companies/{c}/enable", headers=owner).status_code == 200
    assert login("eps.admin", "admin-pass-123").status_code == 200


def test_owner_can_disable_single_admin():
    owner = ensure_owner()
    c = make_company(owner, "Zeta Co")
    make_admin(owner, c, "zeta.one")
    make_admin(owner, c, "zeta.two")
    r = client.post("/api/owner/admins/zeta.one/disable", headers=owner)
    assert r.status_code == 200
    assert login("zeta.one", "admin-pass-123").status_code in (401, 403)
    assert login("zeta.two", "admin-pass-123").status_code == 200


def test_owner_setup_needs_token_and_works_once(monkeypatch):
    body = {"token": "wrong-token-123", "id": "owner.first", "name": "First Owner", "password": "first-owner-pass-1"}
    monkeypatch.delenv("OWNER_SETUP_TOKEN", raising=False)
    assert client.post("/api/owner/setup", json=body).status_code == 403
    monkeypatch.setenv("OWNER_SETUP_TOKEN", "right-token-123")
    assert client.post("/api/owner/setup", json=body).status_code == 403
    ensure_owner()
    ok = {**body, "token": "right-token-123"}
    assert client.post("/api/owner/setup", json=ok).status_code == 409


def test_database_allows_only_one_owner():
    """The one-owner rule is enforced by the database, so racing setup calls cannot create two."""
    import pytest
    from sqlalchemy.exc import IntegrityError

    ensure_owner()
    with pytest.raises(IntegrityError), engine.begin() as c:
        insert_user(c, "owner.second", "Second", "owner", "second-owner-pass-1", None)


def test_company_admin_cannot_become_owner_or_touch_other_roles():
    owner = ensure_owner()
    c = make_company(owner, "Eta Co")
    adm = make_admin(owner, c, "eta.admin")
    r = client.post(
        "/api/settings/access",
        headers=adm,
        json={
            "id": "eta.owner",
            "name": "Eta Owner",
            "password": "eta-owner-pass-1",
            "role": "owner",
            "location_ids": [],
        },
    )
    assert r.status_code in (403, 422)
    # Owner routes stay closed to supervisors and to anyone without a session.
    assert client.get("/api/owner/companies").status_code in (401, 403)
    assert (
        client.post(
            "/api/owner/setup",
            json={"token": "x" * 12, "id": "evil.owner", "name": "Evil", "password": "evil-owner-pass-1"},
        ).status_code
        == 403
    )


def test_admin_resets_supervisor_password_in_own_company_only():
    owner = ensure_owner()
    a = make_company(owner, "Reset Alpha")
    b = make_company(owner, "Reset Beta")
    adm_a = make_admin(owner, a, "reset.admin.a")
    adm_b = make_admin(owner, b, "reset.admin.b")
    assert (
        client.post(
            "/api/settings/access",
            headers=adm_a,
            json={
                "id": "reset.sup.a",
                "name": "Sup A",
                "password": "old-pass-1234",
                "role": "supervisor",
                "location_ids": [],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/settings/access",
            headers=adm_b,
            json={
                "id": "reset.sup.b",
                "name": "Sup B",
                "password": "old-pass-5678",
                "role": "supervisor",
                "location_ids": [],
            },
        ).status_code
        == 200
    )
    sup_session = bearer("reset.sup.a", "old-pass-1234")
    other_session = bearer("reset.sup.b", "old-pass-5678")
    # Other company's admin cannot reset; an admin cannot reset an admin; too short is refused.
    assert (
        client.post(
            "/api/settings/access/reset.sup.a/password", headers=adm_b, json={"password": "hijack-pass-1"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/settings/access/reset.admin.a/password", headers=adm_a, json={"password": "new-admin-pass1"}
        ).status_code
        == 400
    )
    assert (
        client.post("/api/settings/access/reset.sup.a/password", headers=adm_a, json={"password": "short"}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/settings/access/reset.sup.a/password", headers=sup_session, json={"password": "nope-nope-123"}
        ).status_code
        == 403
    )
    assert login("reset.sup.a", "old-pass-1234").status_code == 200
    # The real reset: old password and existing session stop working, others are untouched.
    r = client.post("/api/settings/access/reset.sup.a/password", headers=adm_a, json={"password": "fresh-pass-9876"})
    assert r.status_code == 200 and "fresh-pass-9876" not in r.text
    assert login("reset.sup.a", "old-pass-1234").status_code == 401
    assert login("reset.sup.a", "fresh-pass-9876").status_code == 200
    assert client.get("/api/locations", headers=sup_session).status_code == 401
    assert client.get("/api/locations", headers=other_session).status_code == 200
    log = client.get("/api/audit", headers=adm_a).text
    assert "settings.access.password_reset" in log and "fresh-pass-9876" not in log


def test_owner_edits_company_details_without_touching_company_data():
    owner = ensure_owner()
    cid = make_company(owner, "Details Co")
    adm = make_admin(owner, cid, "details.admin")
    assert client.post(
        "/api/settings/locations",
        headers=adm,
        json={
            "id": "loc-det-1",
            "name": "Det Site",
            "area": "Zone",
            "assigned_count": 1,
            "shift_start": "08:00",
            "shift_end": "16:00",
        },
    ).status_code in (200, 201)
    before = client.get("/api/locations", headers=adm).json()
    r = client.patch(
        f"/api/owner/companies/{cid}",
        headers=owner,
        json={"name": "Details Co Ltd", "address": " 1 Main Road ", "contact_person": "", "contact_phone": "12345"},
    )
    assert r.status_code == 200
    row = next(x for x in client.get("/api/owner/companies", headers=owner).json()["companies"] if x["id"] == cid)
    assert row["name"] == "Details Co Ltd" and row["address"] == "1 Main Road"
    assert row["contact_person"] is None and row["contact_phone"] == "12345"
    assert client.get("/api/locations", headers=adm).json() == before
    # Admins cannot edit company details; nothing is invented when fields are left blank.
    assert client.patch(f"/api/owner/companies/{cid}", headers=adm, json={"name": "Hack"}).status_code in (401, 403)
    audit = client.get("/api/audit", headers=adm).text
    assert "owner.company.details" in audit
