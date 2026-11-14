"""Disable-only semantics: admins disable locations and employees, nothing disappears.

Disabled records stay visible to both roles (greyed out in the app), attendance
history is kept, and new attendance on disabled records is rejected. Re-enable
restores attendance without touching history.
"""

import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import app, local_today
from fastapi.testclient import TestClient

client = TestClient(app)


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def not_in_employee(location_id):
    rows = client.get(f"/api/attendance?location_id={location_id}", headers=auth()).json()["rows"]
    row = next((r for r in rows if r["status"] == "not_in"), None)
    return row["employee_id"] if row else None


def test_disabled_employee_stays_visible_to_both_roles_but_cannot_check_in():
    headers = auth()
    sup = auth("supervisor.demo")
    employee_id = not_in_employee("loc-hsr")
    assert employee_id, "a not-in seeded employee expected"
    # Disable: visible greyed out (active=0) for admin and supervisor alike.
    assert client.delete(f"/api/employees/{employee_id}", headers=headers).status_code == 200
    for who in (headers, sup):
        row = next(e for e in client.get("/api/employees", headers=who).json() if e["id"] == employee_id)
        assert row["active"] == 0
    branch_rows = client.get("/api/employees?location_id=loc-hsr", headers=sup).json()
    assert next(e for e in branch_rows if e["id"] == employee_id)["active"] == 0
    # No new attendance: not in the daily list, and check-in is a clear 409.
    attendance = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()
    assert all(r["employee_id"] != employee_id for r in attendance["rows"])
    blocked = client.post(
        "/api/attendance/checkin",
        headers=sup,
        json={"employee_id": employee_id, "location_id": "loc-hsr"},
    )
    assert blocked.status_code == 409
    assert "disabled" in blocked.json()["detail"].lower()
    # Enable of an active record is a 404; supervisors cannot enable.
    active_id = next(
        e["id"] for e in client.get("/api/employees?location_id=loc-hsr", headers=headers).json() if e["active"] == 1
    )
    assert client.post(f"/api/employees/{active_id}/enable", headers=headers).status_code == 404
    assert client.post(f"/api/employees/{employee_id}/enable", headers=sup).status_code == 403
    # Re-enable restores check-in.
    assert client.post(f"/api/employees/{employee_id}/enable", headers=headers).status_code == 200
    restored = next(e for e in client.get("/api/employees", headers=headers).json() if e["id"] == employee_id)
    assert restored["active"] == 1
    assert (
        client.post(
            "/api/attendance/checkin",
            headers=sup,
            json={"employee_id": employee_id, "location_id": "loc-hsr"},
        ).status_code
        == 200
    )


def test_disabled_location_stays_visible_to_supervisor_and_blocks_attendance():
    headers = auth()
    sup = auth("supervisor.demo")
    month = local_today().isoformat()[:7]
    # A dedicated branch assigned to the demo supervisor keeps this test self-contained.
    created_loc = client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-disable-test",
            "name": "Disable Test Branch",
            "area": "Test Area",
            "supervisor_id": "supervisor.demo",
        },
    )
    assert created_loc.status_code == 200
    created = client.post(
        "/api/employees",
        headers=headers,
        json={
            "name": "Temp Disable Guard",
            "phone": "+91 90000 77777",
            "role": "Guard",
            "location_id": "loc-disable-test",
        },
    )
    assert created.status_code == 200
    employee_id = created.json()["id"]
    # Disable the branch with its employee still assigned: allowed now.
    assert client.delete("/api/settings/locations/loc-disable-test", headers=headers).status_code == 200
    # Both roles still see it, greyed out, and the supervisor keeps the employee list.
    for who in (headers, sup):
        row = next(loc for loc in client.get("/api/locations", headers=who).json() if loc["id"] == "loc-disable-test")
        assert row["active"] == 0
    sup_emps = client.get("/api/employees?location_id=loc-disable-test", headers=sup).json()
    assert any(e["id"] == employee_id for e in sup_emps), "supervisor keeps seeing the disabled branch's employees"
    # Check-in at a disabled branch is a clear 409, for either role.
    for who in (headers, sup):
        blocked = client.post(
            "/api/attendance/checkin",
            headers=who,
            json={"employee_id": employee_id, "location_id": "loc-disable-test"},
        )
        assert blocked.status_code == 409
        assert "disabled" in blocked.json()["detail"].lower()
    # The Month report keeps a breakdown card for the disabled branch, flagged inactive.
    summary = client.get(f"/api/reports/summary?month={month}", headers=headers).json()
    card = next(loc for loc in summary["locations"] if loc["id"] == "loc-disable-test")
    assert card["active"] == 0
    # An employee of a disabled branch cannot be enabled before the branch.
    assert client.delete(f"/api/employees/{employee_id}", headers=headers).status_code == 200
    blocked_enable = client.post(f"/api/employees/{employee_id}/enable", headers=headers)
    assert blocked_enable.status_code == 409
    assert "location first" in blocked_enable.json()["detail"].lower()
    # Enable the branch, then the employee: attendance works again.
    assert client.post("/api/settings/locations/loc-disable-test/enable", headers=headers).status_code == 200
    assert client.post(f"/api/employees/{employee_id}/enable", headers=headers).status_code == 200
    assert (
        client.post(
            "/api/attendance/checkin",
            headers=headers,
            json={"employee_id": employee_id, "location_id": "loc-disable-test"},
        ).status_code
        == 200
    )
    summary_after = client.get(f"/api/reports/summary?month={month}", headers=headers).json()
    assert next(loc for loc in summary_after["locations"] if loc["id"] == "loc-disable-test")["active"] == 1
