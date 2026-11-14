"""Coverage for the Nov 14 feature branch: shifts, IST times, admin controls, optional assignment."""

import os
import sys
from datetime import datetime

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


def test_location_removal_hides_employees_but_keeps_attendance_history():
    headers = auth()
    month = local_today().isoformat()[:7]
    before = client.get(f"/api/reports/monthly?month={month}&location_id=loc-mysuru", headers=headers).json()
    assert before["rows"], "seeded Mysuru history expected"
    assert client.get("/api/employees?location_id=loc-mysuru", headers=headers).json(), "seeded employees expected"
    assert client.delete("/api/settings/locations/loc-mysuru", headers=headers).status_code == 200
    # Employees of the removed branch drop out of the directory...
    assert client.get("/api/employees?location_id=loc-mysuru", headers=headers).json() == []
    assert all(
        e["location_id"] != "loc-mysuru" for e in client.get("/api/employees", headers=headers).json()
    )
    # ...while attendance history stays available to admins.
    after = client.get(f"/api/reports/monthly?month={month}&location_id=loc-mysuru", headers=headers).json()
    assert len(after["rows"]) == len(before["rows"])
    dashboard = client.get("/api/dashboard", headers=headers).json()
    assert all(loc["id"] != "loc-mysuru" for loc in dashboard["locations"])


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
