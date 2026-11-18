"""Attendance-integrity hardening: stale check-outs, edit reasons, duplicate ghosts, import drift.

Each test builds its own employees/locations so it does not depend on test order.
"""

import os
import sys
from datetime import timedelta

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import app, local_today
from demo_db import engine
from demo_security import iso_dt
from fastapi.testclient import TestClient
from shift_helpers import temporary_shifts
from sqlalchemy import text

client = TestClient(app)

# Each test removes the rows it added (fixture below), so exact-count assertions in the
# older shared-database tests keep passing.
_CREATED_EMPLOYEES = []
_CREATED_LOCATIONS = []


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _cleanup_added_rows():
    yield
    for employee_id in _CREATED_EMPLOYEES:
        remove_employee(employee_id)
    _CREATED_EMPLOYEES.clear()
    with engine.begin() as c:
        for location_id in _CREATED_LOCATIONS:
            c.execute(text("DELETE FROM demo_locations WHERE id=:l"), {"l": location_id})
    _CREATED_LOCATIONS.clear()


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def make_employee(headers, name, phone, location="loc-hsr"):
    created = client.post(
        "/api/employees",
        headers=headers,
        json={"name": name, "phone": phone, "role": "Guard", "location_id": location},
    )
    assert created.status_code == 200
    _CREATED_EMPLOYEES.append(created.json()["id"])
    return created.json()["id"]


def force_stale_open(employee_id, location, days_ago=1):
    day = (local_today() - timedelta(days=days_ago)).isoformat()
    with engine.begin() as c:
        c.execute(
            text("DELETE FROM demo_attendance WHERE employee_id=:e AND day=:d"),
            {"e": employee_id, "d": day},
        )
        c.execute(
            text("INSERT INTO demo_attendance VALUES (:id,:e,:l,:d,'checked_in',:cin,NULL,'live demo')"),
            {
                "id": "stale-" + employee_id + "-" + day,
                "e": employee_id,
                "l": location,
                "d": day,
                "cin": iso_dt(local_today() - timedelta(days=days_ago), 22, 0),
            },
        )
    return day


def attendance_row(employee_id, day):
    with engine.connect() as c:
        return (
            c.execute(
                text("SELECT * FROM demo_attendance WHERE employee_id=:e AND day=:d"),
                {"e": employee_id, "d": day},
            )
            .mappings()
            .first()
        )


def remove_employee(employee_id):
    """Shared in-memory database: each test removes what it added, so counts stay exact."""
    with engine.begin() as c:
        locations = [
            row[0]
            for row in c.execute(
                text("SELECT DISTINCT location_id FROM demo_employees WHERE id=:e"), {"e": employee_id}
            )
        ]
        locations += [
            row[0]
            for row in c.execute(
                text("SELECT DISTINCT location_id FROM demo_attendance WHERE employee_id=:e"), {"e": employee_id}
            )
        ]
        c.execute(text("DELETE FROM demo_attendance WHERE employee_id=:e"), {"e": employee_id})
        c.execute(text("DELETE FROM demo_audit WHERE details LIKE :needle"), {"needle": "%" + employee_id + "%"})
        c.execute(text("DELETE FROM demo_employees WHERE id=:e"), {"e": employee_id})
        for location in set(locations):
            c.execute(
                text(
                    "UPDATE demo_locations SET assigned_count="
                    "(SELECT COUNT(*) FROM demo_employees WHERE location_id=:l AND active=1) WHERE id=:l"
                ),
                {"l": location},
            )


def test_checkout_closes_previous_day_open_and_marks_late():
    headers = auth("supervisor.demo")
    employee_id = make_employee(auth(), "Stale One", "+91 97000 00011")
    stale_day = force_stale_open(employee_id, "loc-hsr")
    out = client.post(
        "/api/attendance/checkout",
        headers=headers,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert out.status_code == 200
    assert out.json()["record_day"] == stale_day
    assert "Check the hours" in out.json()["note"]
    row = attendance_row(employee_id, stale_day)
    assert row["status"] == "completed" and row["check_out"]
    assert row["source"] == "live demo - late checkout"


def test_checkin_blocked_until_stale_open_is_closed():
    headers = auth("supervisor.demo")
    employee_id = make_employee(auth(), "Stale Two", "+91 97000 00012")
    stale_day = force_stale_open(employee_id, "loc-hsr")
    blocked = client.post(
        "/api/attendance/checkin",
        headers=headers,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert blocked.status_code == 409
    assert stale_day in blocked.json()["detail"]
    # After the late check-out, a fresh check-in works.
    assert (
        client.post(
            "/api/attendance/checkout",
            headers=headers,
            json={"employee_id": employee_id, "location_id": "loc-hsr"},
        ).status_code
        == 200
    )
    checked = client.post(
        "/api/attendance/checkin",
        headers=headers,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert checked.status_code == 200


def test_attendance_lists_stale_open_for_today_only():
    headers = auth()
    employee_id = make_employee(headers, "Stale Three", "+91 97000 00013")
    stale_day = force_stale_open(employee_id, "loc-hsr")
    today = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()
    stale = next(row for row in today["stale_open"] if row["employee_id"] == employee_id)
    assert stale["day"] == stale_day and stale["check_in"]
    past = client.get(f"/api/attendance?location_id=loc-hsr&day={stale_day}", headers=headers).json()
    assert past["stale_open"] == []
    # Closing the stale record clears the list.
    client.post(
        "/api/attendance/checkout",
        headers=headers,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    refreshed = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()
    assert all(row["employee_id"] != employee_id for row in refreshed["stale_open"])


def test_time_edit_requires_reason_and_caps_shift_length():
    headers = auth()
    today = local_today().isoformat()
    attendance = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()
    target = next(row for row in attendance["rows"] if row["status"] == "checked_in")
    base = {
        "employee_id": target["employee_id"],
        "location_id": "loc-hsr",
        "day": today,
        "check_in": "09:00",
    }
    # No reason at all and a one-word reason both fail validation.
    assert client.patch("/api/attendance/times", headers=headers, json=base).status_code == 422
    assert client.patch("/api/attendance/times", headers=headers, json={**base, "reason": "no"}).status_code == 422
    six_days = {
        **base,
        "check_out": "18:00",
        "check_out_day": (local_today() + timedelta(days=6)).isoformat(),
        "reason": "guard forgot to check out for several days",
    }
    # A site with a shift: an edit cannot go past the shift end (09:00-18:00 at HSR Layout).
    blocked = client.patch("/api/attendance/times", headers=headers, json=six_days)
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Check-out must be at or before the shift end (6:00 pm)."
    # A site with no shift has no limit: a six-day span is allowed with a reason and flagged
    # for review in the audit.
    with temporary_shifts(engine, "loc-hsr", []):
        long_edit = client.patch("/api/attendance/times", headers=headers, json=six_days)
    assert long_edit.status_code == 200
    assert long_edit.json()["long_shift"] is True
    # A valid correction stores the reason and the before/after in the audit log.
    ok = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={**base, "check_out": "17:00", "reason": "guard forgot to check out"},
    )
    assert ok.status_code == 200
    with engine.connect() as c:
        entry = (
            c.execute(
                text(
                    "SELECT details FROM demo_audit WHERE action='attendance.times.edit' "
                    "AND details LIKE :needle ORDER BY at DESC LIMIT 1"
                ),
                {"needle": "%" + target["employee_id"] + "%"},
            )
            .mappings()
            .first()
        )
    assert entry and "guard forgot to check out" in entry["details"]
    assert '"before"' in entry["details"] and '"after"' in entry["details"]
    # Restore the seeded record: this suite shares one in-memory database with exact counts.
    from datetime import datetime

    from demo_db import LOCAL_TZ

    original_hhmm = datetime.fromisoformat(target["check_in"]).astimezone(LOCAL_TZ).strftime("%H:%M")
    restored = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={**base, "check_in": original_hhmm, "reason": "restore the test record"},
    )
    assert restored.status_code == 200
    assert restored.json()["status"] == "checked_in"


def test_audit_log_is_admin_only_and_lists_writes():
    headers = auth()
    supervisor = auth("supervisor.demo")
    assert client.get("/api/audit", headers=supervisor).status_code == 403
    assert client.get("/api/audit").status_code == 401
    employee_id = make_employee(headers, "Audit Guard", "+91 97000 00014")
    rows = client.get("/api/audit", headers=headers).json()["rows"]
    entry = next(row for row in rows if row["action"] == "employee.create")
    assert entry["user_id"] == "admin.demo"
    assert entry["details"]["employee_id"] == employee_id


def test_duplicate_phone_warns_but_shared_phones_stay_allowed():
    """Family or office phones are shared: a repeated number warns the admin, never blocks."""
    headers = auth()
    first = make_employee(headers, "Phone One", "+91 97000 00015")
    duplicate = client.post(
        "/api/employees",
        headers=headers,
        json={"name": "Phone Two", "phone": "+919700000015", "role": "Guard", "location_id": "loc-hsr"},
    )
    assert duplicate.status_code == 200
    warning = duplicate.json()["warning"]
    assert warning and first in warning
    _CREATED_EMPLOYEES.append(duplicate.json()["id"])
    imported = client.post(
        "/api/employees/import",
        headers=headers,
        json={
            "rows": [
                {
                    "name": "Phone Three",
                    "phone": "97000 00015",
                    "role": "Guard",
                    "location_id": "loc-hsr",
                }
            ]
        },
    )
    assert imported.status_code == 200
    assert len(imported.json()["warnings"]) == 1
    with engine.connect() as c:
        third = c.execute(text("SELECT id FROM demo_employees WHERE name='Phone Three'")).scalar()
    _CREATED_EMPLOYEES.append(third)


def test_import_preserves_disabled_state_and_resyncs_headcounts():
    headers = auth()
    employee_id = make_employee(headers, "Import Guard", "+91 97000 00016")
    assert client.delete(f"/api/employees/{employee_id}", headers=headers).status_code == 200
    moved = client.post(
        "/api/employees/import",
        headers=headers,
        json={
            "rows": [
                {
                    "id": employee_id,
                    "name": "Import Guard",
                    "phone": "+91 97000 00016",
                    "role": "Guard",
                    "location_id": "loc-whitefield",
                }
            ]
        },
    )
    assert moved.status_code == 200
    employee = next(e for e in client.get("/api/employees", headers=headers).json() if e["id"] == employee_id)
    # The import updated details and placement but did not silently re-enable the record.
    assert employee["active"] == 0 and employee["location_id"] == "loc-whitefield"
    with engine.connect() as c:
        for location in ("loc-hsr", "loc-whitefield"):
            shown = c.execute(text("SELECT assigned_count FROM demo_locations WHERE id=:l"), {"l": location}).scalar()
            actual = c.execute(
                text("SELECT COUNT(*) FROM demo_employees WHERE location_id=:l AND active=1"), {"l": location}
            ).scalar()
            assert shown == actual, f"assigned_count drifted at {location}"
    # The move is visible in the audit log.
    rows = client.get("/api/audit", headers=headers).json()["rows"]
    transfer = next(row for row in rows if row["action"] == "employee.transfer")
    assert transfer["details"] == {
        "employee_id": employee_id,
        "from": "loc-hsr",
        "to": "loc-whitefield",
    }


def test_import_and_create_reject_disabled_location():
    headers = auth()
    created = client.post(
        "/api/settings/locations",
        headers=headers,
        json={"id": "loc-integrity-off", "name": "Integrity Off Branch", "area": "Test Area"},
    )
    assert created.status_code == 200
    _CREATED_LOCATIONS.append("loc-integrity-off")
    assert client.delete("/api/settings/locations/loc-integrity-off", headers=headers).status_code == 200
    direct = client.post(
        "/api/employees",
        headers=headers,
        json={
            "name": "Off Guard",
            "phone": "+91 97000 00017",
            "role": "Guard",
            "location_id": "loc-integrity-off",
        },
    )
    assert direct.status_code == 409
    imported = client.post(
        "/api/employees/import",
        headers=headers,
        json={
            "rows": [
                {
                    "name": "Off Guard",
                    "phone": "+91 97000 00017",
                    "role": "Guard",
                    "location_id": "loc-integrity-off",
                }
            ]
        },
    )
    assert imported.status_code == 409
    # After re-enable, both paths work again.
    assert client.post("/api/settings/locations/loc-integrity-off/enable", headers=headers).status_code == 200
    assert (
        client.post(
            "/api/employees",
            headers=headers,
            json={
                "name": "Off Guard",
                "phone": "+91 97000 00017",
                "role": "Guard",
                "location_id": "loc-integrity-off",
            },
        ).status_code
        == 200
    )
    with engine.connect() as c:
        added = c.execute(text("SELECT id FROM demo_employees WHERE location_id='loc-integrity-off'")).scalar()
    _CREATED_EMPLOYEES.append(added)


def test_legacy_double_open_recovers_one_checkout_at_a_time():
    """Old data can hold two open records for one employee (created before the guard).

    Each check-out closes the newest open record, the older one stays listed as stale,
    and no new check-in is possible until every open record is closed. No new overlap
    can be created: the check-in guard sees the open records.
    """
    headers = auth("supervisor.demo")
    employee_id = make_employee(auth(), "Legacy Overlap", "+91 97000 00018")
    stale_day = force_stale_open(employee_id, "loc-hsr", days_ago=2)
    # A second, newer open record, as legacy data can hold.
    newer_day = force_stale_open(employee_id, "loc-hsr", days_ago=1)
    blocked = client.post(
        "/api/attendance/checkin",
        headers=headers,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert blocked.status_code == 409
    first = client.post(
        "/api/attendance/checkout",
        headers=headers,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert first.status_code == 200
    assert first.json()["record_day"] == newer_day
    # The older record is still open and listed; check-in is still blocked.
    today = client.get("/api/attendance?location_id=loc-hsr", headers=auth()).json()
    stale = [row["day"] for row in today["stale_open"] if row["employee_id"] == employee_id]
    assert stale == [stale_day]
    assert (
        client.post(
            "/api/attendance/checkin",
            headers=headers,
            json={"employee_id": employee_id, "location_id": "loc-hsr"},
        ).status_code
        == 409
    )
    second = client.post(
        "/api/attendance/checkout",
        headers=headers,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert second.status_code == 200
    assert second.json()["record_day"] == stale_day
    # Everything closed: a fresh check-in works and nothing stale remains.
    assert (
        client.post(
            "/api/attendance/checkin",
            headers=headers,
            json={"employee_id": employee_id, "location_id": "loc-hsr"},
        ).status_code
        == 200
    )
    refreshed = client.get("/api/attendance?location_id=loc-hsr", headers=auth()).json()
    assert all(row["employee_id"] != employee_id for row in refreshed["stale_open"])


def test_adhoc_checkin_at_another_site_is_recorded_where_worked():
    # EMP-ID model: pre-assignment is a default, not a restriction. An employee whose home
    # site is HSR takes an ad-hoc shift at Mysuru (supervisor.demo does not manage Mysuru,
    # so use an admin session as the signed-in marker; a supervisor of Mysuru would do).
    employee_id = make_employee(auth(), "Adhoc Guard", "+919700000031", "loc-hsr")
    sup = auth("supervisor.demo")
    # Lookup resolves any employee by EMP ID with minimal fields (no phone).
    found = client.get(f"/api/employee-lookup?employee_id={employee_id}", headers=sup)
    assert found.status_code == 200
    assert found.json()["location_id"] == "loc-hsr"
    assert "phone" not in found.json()
    checked = client.post(
        "/api/attendance/checkin",
        headers=auth(),
        json={"employee_id": employee_id, "location_id": "loc-mysuru"},
    )
    assert checked.status_code == 200
    assert checked.json()["adhoc"] is True
    assert checked.json()["home_location_id"] == "loc-hsr"
    # The shift shows on Mysuru's list flagged ad hoc, not on HSR's list; home kept.
    mysuru = client.get("/api/attendance?location_id=loc-mysuru", headers=auth()).json()
    row = next(r for r in mysuru["rows"] if r["employee_id"] == employee_id)
    assert row["adhoc"] is True and row["status"] == "checked_in"
    hsr = client.get("/api/attendance?location_id=loc-hsr", headers=auth()).json()
    assert next(r for r in hsr["rows"] if r["employee_id"] == employee_id)["status"] == "not_in"
    assert client.get(f"/api/employees?q={employee_id}", headers=auth()).json()[0]["location_id"] == "loc-hsr"
    # Check-out at the worked site closes it.
    out = client.post(
        "/api/attendance/checkout",
        headers=auth(),
        json={"employee_id": employee_id, "location_id": "loc-mysuru"},
    )
    assert out.status_code == 200
    # And the ad-hoc check-in is audit-traceable with the home site recorded.
    log = client.get("/api/audit?limit=500", headers=auth()).json()
    entry = next(
        r for r in log["rows"] if r["action"] == "attendance.checkin" and r["details"].get("employee_id") == employee_id
    )
    assert entry["details"].get("adhoc") is True and entry["details"].get("home_location_id") == "loc-hsr"


def test_supervisor_cannot_mark_at_site_they_do_not_manage():
    # Ad hoc does not widen the site boundary: the site is still supervisor-authorized.
    sup = auth("supervisor.demo")
    assert (
        client.post(
            "/api/attendance/checkin",
            headers=sup,
            json={"employee_id": "EMP1024", "location_id": "loc-mysuru"},
        ).status_code
        == 403
    )


def test_employee_lookup_requires_auth_and_stays_minimal():
    # No token: the EMP-ID lookup is not a public endpoint.
    assert client.get("/api/employee-lookup?employee_id=EMP1024").status_code in (401, 403)
    # Unknown ID: 404, no oracle about near-misses.
    assert client.get("/api/employee-lookup?employee_id=EMP9999", headers=auth()).status_code == 404
    # Response carries only what the marker needs to confirm the person.
    body = client.get("/api/employee-lookup?employee_id=EMP1024", headers=auth()).json()
    assert set(body) == {"id", "name", "role", "location_id", "active", "location_name"}


def test_employee_lookup_by_name_single_match():
    # A name that identifies one person resolves exactly like an EMP ID, with the
    # same minimal fields (no phone), case-insensitively.
    body = client.get("/api/employee-lookup?employee_id=VIKRAM", headers=auth()).json()
    assert body["id"] == "EMP1051"
    assert set(body) == {"id", "name", "role", "location_id", "active", "location_name"}


def test_employee_lookup_by_name_multiple_matches_returns_pick_list():
    # A name matching several people returns a pick list instead of guessing; the
    # supervisor chooses the right person. Ad-hoc flow: matches are not limited to
    # the signed-in supervisor's own site, but carry no private fields.
    first = make_employee(auth(), "Zoya Khan", "+919700000041", "loc-hsr")
    second = make_employee(auth(), "Zoya Rahman", "+919700000042", "loc-mysuru")
    sup = auth("supervisor.demo")
    body = client.get("/api/employee-lookup?employee_id=zoya", headers=sup).json()
    ids = [m["id"] for m in body["matches"]]
    assert ids == [first, second]  # ordered by name: Zoya Khan before Zoya Rahman
    for m in body["matches"]:
        assert set(m) == {"id", "name", "role", "location_id", "active", "location_name"}
    # The pick-list entries resolve to full single-employee lookups by their IDs.
    assert client.get(f"/api/employee-lookup?employee_id={first}", headers=sup).json()["name"] == "Zoya Khan"


def test_employee_lookup_by_name_no_match_is_404():
    assert client.get("/api/employee-lookup?employee_id=No%20Such%20Person", headers=auth()).status_code == 404
