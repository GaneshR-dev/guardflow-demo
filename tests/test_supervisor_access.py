"""Supervisor access management: site-coverage edits and disable/enable.

Covers the two buyer-audit gaps: changing an existing supervisor's sites and
disabling a departing supervisor's login without touching history.
"""

import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import app  # noqa: E402
from demo_db import engine  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

client = TestClient(app)


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def make_supervisor(user_id="sup.alpha", sites=("loc-hsr",)):
    created = client.post(
        "/api/settings/access",
        headers=auth(),
        json={
            "id": user_id,
            "name": "Alpha Supervisor",
            "password": "temporary-pass-1",
            "role": "supervisor",
            "location_ids": list(sites),
        },
    )
    assert created.status_code == 200, created.text
    return user_id


def access_entry(user_id, headers=None):
    settings = client.get("/api/settings", headers=headers or auth()).json()
    return next(u for u in settings["access"] if u["id"] == user_id)


def test_edit_sites_replaces_grants_and_enforces_scope_immediately():
    user_id = make_supervisor("sup.edit1", ["loc-hsr"])
    sup = auth(user_id, "temporary-pass-1")
    assert [loc["id"] for loc in client.get("/api/locations", headers=sup).json()] == ["loc-hsr"]

    updated = client.patch(
        "/api/settings/access/sup.edit1/locations",
        headers=auth(),
        json={"location_ids": ["loc-whitefield", "loc-mysuru"]},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["location_ids"] == ["loc-whitefield", "loc-mysuru"]

    # Existing session sees the new scope on its very next request: old site closed, new sites open.
    assert client.get("/api/attendance?location_id=loc-hsr", headers=sup).status_code == 403
    assert sorted(loc["id"] for loc in client.get("/api/locations", headers=sup).json()) == [
        "loc-mysuru",
        "loc-whitefield",
    ]
    assert access_entry("sup.edit1")["location_ids"] == ["loc-whitefield", "loc-mysuru"]

    audit = client.get("/api/audit?limit=10", headers=auth()).json()
    entry = next(a for a in audit["rows"] if a["action"] == "settings.access.locations")
    assert entry["details"]["before"] == ["loc-hsr"]
    assert entry["details"]["after"] == ["loc-whitefield", "loc-mysuru"]


def test_empty_sites_fail_closed():
    user_id = make_supervisor("sup.edit2", ["loc-hsr"])
    sup = auth(user_id, "temporary-pass-1")
    cleared = client.patch("/api/settings/access/sup.edit2/locations", headers=auth(), json={"location_ids": []})
    assert cleared.status_code == 200
    assert cleared.json()["location_ids"] == []
    # Fail closed: no accidental all-sites access when the grant list is empty.
    assert client.get("/api/locations", headers=sup).json() == []
    assert client.get("/api/attendance?location_id=loc-hsr", headers=sup).status_code == 403


def test_unknown_site_rejected_and_grants_unchanged():
    make_supervisor("sup.edit3", ["loc-hsr"])
    bad = client.patch(
        "/api/settings/access/sup.edit3/locations", headers=auth(), json={"location_ids": ["loc-nowhere"]}
    )
    assert bad.status_code == 404
    assert access_entry("sup.edit3")["location_ids"] == ["loc-hsr"]


def test_disable_revokes_sessions_blocks_login_and_preserves_history():
    user_id = make_supervisor("sup.leaver", ["loc-hsr"])
    sup = auth(user_id, "temporary-pass-1")
    assert client.get("/api/locations", headers=sup).status_code == 200
    before_history = client.get("/api/attendance?location_id=loc-hsr", headers=auth()).json()

    disabled = client.delete("/api/settings/access/sup.leaver", headers=auth())
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["status"] == "disabled"

    # The existing token is dead on the very next request, and sign-in is blocked.
    assert client.get("/api/locations", headers=sup).status_code in (401, 403)
    relogin = client.post("/api/login", json={"username": "sup.leaver", "password": "temporary-pass-1"})
    assert relogin.status_code == 403

    # Account, site grants and attendance history all kept; row shows Disabled.
    entry = access_entry("sup.leaver")
    assert entry["active"] == 0
    assert entry["location_ids"] == ["loc-hsr"]
    after_history = client.get("/api/attendance?location_id=loc-hsr", headers=auth()).json()
    assert after_history["summary"] == before_history["summary"]

    # Re-enable restores the previous coverage; old password still works.
    enabled = client.post("/api/settings/access/sup.leaver/enable", headers=auth())
    assert enabled.status_code == 200
    # ...but the token revoked at disable stays revoked: only a fresh sign-in works.
    assert client.get("/api/locations", headers=sup).status_code in (401, 403)
    sup2 = auth("sup.leaver", "temporary-pass-1")
    assert [loc["id"] for loc in client.get("/api/locations", headers=sup2).json()] == ["loc-hsr"]

    audit = client.get("/api/audit?limit=20", headers=auth()).json()
    actions = [a["action"] for a in audit["rows"]]
    assert "settings.access.disable" in actions
    assert "settings.access.enable" in actions


def test_guards_supervisor_only_and_no_self_disable():
    # Admin accounts are out of scope for these endpoints.
    assert (
        client.patch("/api/settings/access/admin.demo/locations", headers=auth(), json={"location_ids": []}).status_code
        == 400
    )
    assert client.delete("/api/settings/access/admin.demo", headers=auth()).status_code == 400
    assert client.post("/api/settings/access/admin.demo/enable", headers=auth()).status_code == 400
    # Unknown users 404; double-disable 404.
    assert client.delete("/api/settings/access/sup.ghost", headers=auth()).status_code == 404
    make_supervisor("sup.guard", ["loc-hsr"])
    assert client.delete("/api/settings/access/sup.guard", headers=auth()).status_code == 200
    assert client.delete("/api/settings/access/sup.guard", headers=auth()).status_code == 404
    # Supervisors cannot manage access at all.
    make_supervisor("sup.guard2", ["loc-hsr"])
    sup = auth("sup.guard2", "temporary-pass-1")
    assert (
        client.patch("/api/settings/access/sup.guard2/locations", headers=sup, json={"location_ids": []}).status_code
        == 403
    )
    assert client.delete("/api/settings/access/sup.guard2", headers=sup).status_code == 403


def test_unsupervised_warning_returned_not_blocked():
    # A dedicated site, so coverage by other supervisors from other tests cannot mask it.
    created = client.post(
        "/api/settings/locations",
        headers=auth(),
        json={"id": "loc-lonely", "name": "Lonely Site", "area": "Nowhere", "assigned_count": 1},
    )
    assert created.status_code == 200, created.text
    make_supervisor("sup.lone", ["loc-lonely"])
    cleared = client.patch("/api/settings/access/sup.lone/locations", headers=auth(), json={"location_ids": []})
    assert cleared.status_code == 200
    assert "loc-lonely" in cleared.json()["unsupervised"]


def test_active_flag_enforced_on_every_request_even_with_live_session():
    """Backstop: if a session row survives revocation (race, manual edit, future code
    path), current_user still rejects a disabled account on every request."""
    make_supervisor("sup.backstop", ["loc-hsr"])
    sup = auth("sup.backstop", "temporary-pass-1")
    assert client.get("/api/locations", headers=sup).status_code == 200
    # Insert the disabled marker directly, leaving the session row intact.
    with engine.begin() as c:
        c.execute(
            text("INSERT INTO demo_disabled_users VALUES ('sup.backstop','2026-11-15T00:00:00+00:00','admin.demo')")
        )
    assert client.get("/api/locations", headers=sup).status_code == 403
    with engine.begin() as c:
        c.execute(text("DELETE FROM demo_disabled_users WHERE user_id='sup.backstop'"))
    assert client.get("/api/locations", headers=sup).status_code == 200


def test_attendance_history_and_exports_preserved_identical():
    """Real seeded attendance rows, summaries and CSV/Excel exports are byte-identical
    before and after site edits plus a full disable/enable cycle."""
    make_supervisor("sup.history", ["loc-hsr"])
    admin = auth()
    day_rows_before = client.get("/api/attendance?location_id=loc-hsr", headers=admin).json()
    csv_before = client.get("/api/reports/export.csv?month=" + _this_month(), headers=admin).content
    xlsx_before = client.get("/api/reports/export.xlsx?month=" + _this_month(), headers=admin).content

    client.patch("/api/settings/access/sup.history/locations", headers=admin, json={"location_ids": ["loc-whitefield"]})
    assert client.delete("/api/settings/access/sup.history", headers=admin).status_code == 200
    assert client.post("/api/settings/access/sup.history/enable", headers=admin).status_code == 200

    assert client.get("/api/attendance?location_id=loc-hsr", headers=admin).json() == day_rows_before
    assert client.get("/api/reports/export.csv?month=" + _this_month(), headers=admin).content == csv_before
    # XLSX bytes embed a creation timestamp; compare the actual cell content instead.
    assert _xlsx_cells(
        client.get("/api/reports/export.xlsx?month=" + _this_month(), headers=admin).content
    ) == _xlsx_cells(xlsx_before)


def _this_month():
    from demo_security import local_today

    return local_today().isoformat()[:7]


def _xlsx_cells(content):
    import io

    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(content))
    return {ws.title: [tuple(row) for row in ws.iter_rows(values_only=True)] for ws in wb.worksheets}
