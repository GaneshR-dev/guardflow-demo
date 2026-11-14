"""Coverage for the Nov 14 feature branch: shifts, IST times, admin controls, optional assignment."""

import os
import sys
from datetime import date, datetime, timedelta

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import app, local_today
from fastapi.testclient import TestClient

client = TestClient(app)


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def test_location_create_with_shift_visible_to_both_roles_then_remove():
    headers = auth()
    created = client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-shift-test",
            "name": "Shift Test Branch",
            "area": "Test Area",
            "shift_start": "09:00",
            "shift_end": "18:00",
            "supervisor_id": "supervisor.demo",
        },
    )
    assert created.status_code == 200
    assert created.json()["shift_start"] == "09:00"
    row = next(
        loc for loc in client.get("/api/locations", headers=headers).json() if loc["id"] == "loc-shift-test"
    )
    assert row["shift_start"] == "09:00" and row["shift_end"] == "18:00" and row["active"] == 1
    # The assigned supervisor sees the same location with its shift.
    sup = auth("supervisor.demo")
    supervisor_row = next(
        loc for loc in client.get("/api/locations", headers=sup).json() if loc["id"] == "loc-shift-test"
    )
    assert supervisor_row["shift_end"] == "18:00"
    # Shift times must be 24-hour HH:MM.
    bad = client.post(
        "/api/settings/locations",
        headers=headers,
        json={"id": "loc-bad-shift", "name": "Bad Shift", "area": "Area", "shift_start": "9am"},
    )
    assert bad.status_code == 422
    # Admin removal retires the branch from both roles' lists.
    assert client.delete("/api/settings/locations/loc-shift-test", headers=headers).status_code == 200
    assert all(loc["id"] != "loc-shift-test" for loc in client.get("/api/locations", headers=headers).json())
    assert all(loc["id"] != "loc-shift-test" for loc in client.get("/api/locations", headers=sup).json())
    # Second removal is a clean 404, and supervisors can never remove a location.
    assert client.delete("/api/settings/locations/loc-shift-test", headers=headers).status_code == 404
    assert client.delete("/api/settings/locations/loc-hsr", headers=sup).status_code == 403


def test_employee_location_optional_at_creation_and_admin_remove():
    headers = auth()
    created = client.post(
        "/api/employees",
        headers=headers,
        json={"name": "Unassigned Guard", "phone": "+91 90000 12345", "role": "Guard"},
    )
    assert created.status_code == 200
    employee_id = created.json()["id"]
    assert created.json()["location_id"] is None
    # Unassigned employees still show in the admin directory so they can be placed later.
    assert any(e["id"] == employee_id for e in client.get("/api/employees", headers=headers).json())
    # But they cannot be checked in anywhere until assigned.
    blocked = client.post(
        "/api/attendance/checkin",
        headers=headers,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert blocked.status_code == 409
    assert "no location assigned" in blocked.json()["detail"].lower()
    # Admin removal retires the record; a second removal is a 404.
    assert client.delete(f"/api/employees/{employee_id}", headers=headers).status_code == 200
    assert all(e["id"] != employee_id for e in client.get("/api/employees", headers=headers).json())
    assert client.delete(f"/api/employees/{employee_id}", headers=headers).status_code == 404
    # Supervisors can never remove employees.
    assert client.delete("/api/employees/EMP1024", headers=auth("supervisor.demo")).status_code == 403


def test_location_removal_guard_then_removal_keeps_attendance_history():
    headers = auth()
    mysuru_emps = client.get("/api/employees?location_id=loc-mysuru", headers=headers).json()
    assert mysuru_emps, "seeded employees expected"
    today_rows = client.get("/api/attendance?location_id=loc-mysuru", headers=headers).json()["rows"]
    not_in = next((r for r in today_rows if r["status"] == "not_in"), None)
    target_id = not_in["employee_id"] if not_in else None
    # An open check-in blocks removal with an actionable message, never a silent disappearance.
    if target_id:
        assert (
            client.post(
                "/api/attendance/checkin",
                headers=headers,
                json={"employee_id": target_id, "location_id": "loc-mysuru"},
            ).status_code
            == 200
        )
    blocked = client.delete("/api/settings/locations/loc-mysuru", headers=headers)
    assert blocked.status_code == 409
    detail = blocked.json()["detail"].lower()
    assert "reassign" in detail and "cannot remove" in detail
    if target_id:
        assert "check-in" in detail
    # The location and its employees are untouched while blocked.
    assert any(loc["id"] == "loc-mysuru" for loc in client.get("/api/locations", headers=headers).json())
    assert client.get("/api/employees?location_id=loc-mysuru", headers=headers).json(), "employees must stay put"
    if target_id:
        assert (
            client.post(
                "/api/attendance/checkout",
                headers=headers,
                json={"employee_id": target_id, "location_id": "loc-mysuru"},
            ).status_code
            == 200
        )
    month = local_today().isoformat()[:7]
    before = client.get(f"/api/reports/monthly?month={month}&location_id=loc-mysuru", headers=headers).json()
    assert before["rows"], "seeded Mysuru history expected"
    # Assigned employees still block removal even with no open attendance.
    blocked2 = client.delete("/api/settings/locations/loc-mysuru", headers=headers)
    assert blocked2.status_code == 409
    assert "employee" in blocked2.json()["detail"].lower() and "reassign" in blocked2.json()["detail"].lower()
    # Reassign everyone to HSR through the import path, which keeps IDs and updates locations.
    rows = [
        {"id": e["id"], "name": e["name"], "phone": e["phone"], "role": e["role"], "location_id": "loc-hsr"}
        for e in mysuru_emps
    ]
    imported = client.post("/api/employees/import", headers=headers, json={"rows": rows})
    assert imported.status_code == 200
    assert imported.json()["updated"] == len(rows)
    # Now removal succeeds: the branch retires, employees stay visible at their new branch.
    assert client.delete("/api/settings/locations/loc-mysuru", headers=headers).status_code == 200
    assert client.get("/api/employees?location_id=loc-mysuru", headers=headers).json() == []
    assert all(e["location_id"] != "loc-mysuru" for e in client.get("/api/employees", headers=headers).json())
    after = client.get(f"/api/reports/monthly?month={month}&location_id=loc-mysuru", headers=headers).json()
    assert len(after["rows"]) == len(before["rows"]), "attendance history must survive removal"
    dashboard = client.get("/api/dashboard", headers=headers).json()
    assert all(loc["id"] != "loc-mysuru" for loc in dashboard["locations"])
    assert client.delete("/api/settings/locations/loc-mysuru", headers=headers).status_code == 404


def test_admin_time_edit_converts_ist_to_utc_and_is_admin_only():
    headers = auth()
    today = local_today().isoformat()
    attendance = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()
    target = next(row for row in attendance["rows"] if row["status"] == "checked_in")
    edited = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={
            "employee_id": target["employee_id"],
            "location_id": "loc-hsr",
            "day": today,
            "check_in": "09:15",
            "check_out": "18:45",
        },
    )
    assert edited.status_code == 200
    body = edited.json()
    assert body["status"] == "completed"
    # 09:15 IST is 03:45 UTC; stored timestamps stay UTC ISO.
    assert datetime.fromisoformat(body["check_in"]).strftime("%H:%M") == "03:45"
    assert datetime.fromisoformat(body["check_out"]).strftime("%H:%M") == "13:15"
    refreshed = client.get("/api/attendance?location_id=loc-hsr&day=" + today, headers=headers).json()
    row = next(r for r in refreshed["rows"] if r["employee_id"] == target["employee_id"])
    assert row["status"] == "completed"
    # Clearing check-out returns the record to checked_in.
    reopened = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={
            "employee_id": target["employee_id"],
            "location_id": "loc-hsr",
            "day": today,
            "check_in": "09:15",
        },
    )
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "checked_in"
    assert reopened.json()["check_out"] is None
    # Check-out must be after check-in.
    inverted = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={
            "employee_id": target["employee_id"],
            "location_id": "loc-hsr",
            "day": today,
            "check_in": "18:00",
            "check_out": "09:00",
        },
    )
    assert inverted.status_code == 400
    # Supervisors are refused: time modification is admin-only.
    denied = client.patch(
        "/api/attendance/times",
        headers=auth("supervisor.demo"),
        json={
            "employee_id": target["employee_id"],
            "location_id": "loc-hsr",
            "day": today,
            "check_in": "09:15",
        },
    )
    assert denied.status_code == 403
    # A day with no record cannot be invented through editing.
    missing = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={
            "employee_id": target["employee_id"],
            "location_id": "loc-hsr",
            "day": "2026-01-05",
            "check_in": "09:15",
        },
    )
    assert missing.status_code == 404


def test_sqlite_migration_preserves_existing_data(tmp_path, monkeypatch):
    """A pre-feature SQLite database keeps its rows when location_id becomes optional."""
    import demo_db
    import sqlalchemy
    from sqlalchemy import text as sql_text

    old_engine = sqlalchemy.create_engine(f"sqlite:///{tmp_path}/old.db")
    with old_engine.begin() as c:
        c.execute(
            sql_text(
                "CREATE TABLE demo_employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, role TEXT NOT NULL, location_id TEXT NOT NULL, active INTEGER NOT NULL)"
            )
        )
        c.execute(sql_text("INSERT INTO demo_employees VALUES ('emp-old','Old Guard','9000000099','Guard','loc-hsr',1)"))
        c.execute(
            sql_text(
                "CREATE TABLE demo_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, assigned_count INTEGER NOT NULL)"
            )
        )
        c.execute(sql_text("INSERT INTO demo_locations VALUES ('loc-old','Old Branch','Old Area',3)"))
    monkeypatch.setattr(demo_db, "engine", old_engine)
    demo_db.migrate_db()
    demo_db.migrate_db()  # second run must be a no-op
    with old_engine.begin() as c:
        employee_columns = demo_db._columns(c, "demo_employees")
        assert employee_columns["location_id"] is True
        rows = c.execute(sql_text("SELECT * FROM demo_employees")).mappings().all()
        assert [dict(r) for r in rows] == [
            {
                "id": "emp-old",
                "name": "Old Guard",
                "phone": "9000000099",
                "role": "Guard",
                "location_id": "loc-hsr",
                "active": 1,
            }
        ]
        # After the rebuild, an unassigned employee can be inserted.
        c.execute(sql_text("INSERT INTO demo_employees VALUES ('emp-new','New Guard','9000000098','Guard',NULL,1)"))
        location_columns = demo_db._columns(c, "demo_locations")
        assert "shift_start" in location_columns and "shift_end" in location_columns and "active" in location_columns
        loc = c.execute(sql_text("SELECT assigned_count, active FROM demo_locations WHERE id='loc-old'")).mappings().first()
        assert loc["assigned_count"] == 3 and loc["active"] == 1


def test_admin_time_edit_supports_next_day_checkout():
    """Overnight security shifts: an admin correction can set a next-day checkout date."""
    headers = auth()
    today = local_today().isoformat()
    attendance = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()
    target = next(row for row in attendance["rows"] if row["status"] == "checked_in")
    next_day = (date.fromisoformat(today) + timedelta(days=1)).isoformat()
    edited = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={
            "employee_id": target["employee_id"],
            "location_id": "loc-hsr",
            "day": today,
            "check_in": "22:00",
            "check_out": "06:00",
            "check_out_day": next_day,
        },
    )
    assert edited.status_code == 200
    body = edited.json()
    assert body["status"] == "completed" and body["check_out_day"] == next_day
    check_in = datetime.fromisoformat(body["check_in"])
    check_out = datetime.fromisoformat(body["check_out"])
    # 22:00 IST is 16:30 UTC on the record day; 06:00 IST next day is 00:30 UTC next day: 8 hours.
    assert check_in.strftime("%H:%M") == "16:30"
    assert check_out.strftime("%H:%M") == "00:30"
    assert (check_out - check_in).total_seconds() == 8 * 3600
    # A checkout date before the check-in date is rejected outright.
    before_day = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
    backwards = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={
            "employee_id": target["employee_id"],
            "location_id": "loc-hsr",
            "day": today,
            "check_in": "22:00",
            "check_out": "06:00",
            "check_out_day": before_day,
        },
    )
    assert backwards.status_code == 400
    # Without an explicit checkout date the same-day rule still applies.
    same_day_overnight = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={
            "employee_id": target["employee_id"],
            "location_id": "loc-hsr",
            "day": today,
            "check_in": "22:00",
            "check_out": "06:00",
        },
    )
    assert same_day_overnight.status_code == 400


def test_supervisor_cannot_see_or_use_unassigned_employees():
    """Nullable location must not widen supervisor scope: unassigned employees are admin-only."""
    headers = auth()
    created = client.post(
        "/api/employees",
        headers=headers,
        json={"name": "Floating Guard", "phone": "+91 90000 55555", "role": "Guard"},
    )
    assert created.status_code == 200
    employee_id = created.json()["id"]
    assert created.json()["location_id"] is None
    sup = auth("supervisor.demo")
    # Invisible in the supervisor directory, both overall and per branch.
    assert all(e["id"] != employee_id for e in client.get("/api/employees", headers=sup).json())
    assert all(
        e["id"] != employee_id for e in client.get("/api/employees?location_id=loc-hsr", headers=sup).json()
    )
    # A supervisor cannot check them in anywhere.
    attempt = client.post(
        "/api/attendance/checkin",
        headers=sup,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert attempt.status_code == 409
    assert "no location assigned" in attempt.json()["detail"].lower()
    # Nor modify their times.
    denied = client.patch(
        "/api/attendance/times",
        headers=sup,
        json={"employee_id": employee_id, "location_id": "loc-hsr", "day": local_today().isoformat(), "check_in": "09:00"},
    )
    assert denied.status_code == 403
    # Admins still see the unassigned employee so they can place them later.
    assert any(e["id"] == employee_id for e in client.get("/api/employees", headers=headers).json())


def test_employee_removal_guard_blocks_open_checkin_and_keeps_history():
    """Symmetric with the location guard: removal cannot strand an open check-in."""
    headers = auth()
    sup = auth("supervisor.demo")
    today = local_today().isoformat()
    month = today[:7]
    rows = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()["rows"]
    target = next(r for r in rows if r["status"] == "not_in")
    employee_id = target["employee_id"]
    assert (
        client.post(
            "/api/attendance/checkin",
            headers=sup,
            json={"employee_id": employee_id, "location_id": "loc-hsr"},
        ).status_code
        == 200
    )
    # Removal is blocked with a clear check-out-first message.
    blocked = client.delete(f"/api/employees/{employee_id}", headers=headers)
    assert blocked.status_code == 409
    detail = blocked.json()["detail"].lower()
    assert "check-out" in detail and "cannot remove" in detail
    # The employee, their UI row and the open record are all untouched.
    assert any(e["id"] == employee_id for e in client.get("/api/employees", headers=headers).json())
    ui_rows = client.get("/api/attendance?location_id=loc-hsr", headers=sup).json()["rows"]
    shown = next(r for r in ui_rows if r["employee_id"] == employee_id)
    assert shown["status"] == "checked_in"
    # After checkout, removal succeeds and history/reporting are preserved.
    assert (
        client.post(
            "/api/attendance/checkout",
            headers=sup,
            json={"employee_id": employee_id, "location_id": "loc-hsr"},
        ).status_code
        == 200
    )
    assert client.delete(f"/api/employees/{employee_id}", headers=headers).status_code == 200
    assert all(e["id"] != employee_id for e in client.get("/api/employees", headers=headers).json())
    report = client.get(f"/api/reports/monthly?month={month}&location_id=loc-hsr", headers=headers).json()
    kept = next((r for r in report["rows"] if r["employee_id"] == employee_id and r["day"] == today), None)
    assert kept is not None and kept["status"] == "completed" and kept["employee_name"]
