"""API tests for PATCH /api/employees/{id}: edit the name, phone and site of a guard.

Each test adds its own guard and removes it at the end, so the tests do not depend on order.
"""

import json
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import pytest
from demo_app import app
from demo_db import engine
from fastapi.testclient import TestClient
from sqlalchemy import text

client = TestClient(app)
_ADDED = []


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    with engine.begin() as c:
        for employee_id in _ADDED:
            c.execute(text("DELETE FROM demo_attendance WHERE employee_id=:e"), {"e": employee_id})
            c.execute(text("DELETE FROM demo_audit WHERE details LIKE :n"), {"n": "%" + employee_id + "%"})
            c.execute(text("DELETE FROM demo_employees WHERE id=:e"), {"e": employee_id})
        c.execute(
            text(
                "UPDATE demo_locations SET assigned_count="
                "(SELECT COUNT(*) FROM demo_employees WHERE location_id=demo_locations.id AND active=1)"
            )
        )
    _ADDED.clear()


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def add_guard(headers, location="loc-hsr", phone="+91 97100 00001"):
    created = client.post(
        "/api/employees", headers=headers, json={"name": "Edit Test", "phone": phone, "location_id": location}
    )
    assert created.status_code == 200
    _ADDED.append(created.json()["id"])
    return created.json()["id"]


def headcount(location_id):
    with engine.connect() as c:
        return c.execute(text("SELECT assigned_count FROM demo_locations WHERE id=:l"), {"l": location_id}).scalar()


def audit_rows(employee_id, action):
    with engine.connect() as c:
        rows = c.execute(
            text("SELECT details FROM demo_audit WHERE action=:a AND details LIKE :n"),
            {"a": action, "n": "%" + employee_id + "%"},
        )
        return [json.loads(r[0]) for r in rows]


def edit(headers, employee_id, **changes):
    body = {"name": "Edit Test", "phone": "+91 97100 00001", "location_id": "loc-hsr", **changes}
    return client.patch(f"/api/employees/{employee_id}", headers=headers, json=body)


def test_edit_needs_sign_in_and_admin():
    headers = auth()
    employee_id = add_guard(headers)
    assert client.patch(f"/api/employees/{employee_id}", json={"name": "X Y", "phone": "1234567"}).status_code == 401
    assert edit(auth("supervisor.demo"), employee_id, name="New Name").status_code == 403


def test_edit_unknown_or_other_company_guard_is_404():
    headers = auth()
    assert edit(headers, "EMP0000").status_code == 404
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO demo_employees (id,name,phone,role,location_id,active,company_id) "
                "VALUES ('EMP-OTHER-CO','Other','+91 90000 00000','Guard',NULL,1,'other-company')"
            )
        )
    _ADDED.append("EMP-OTHER-CO")
    response = edit(headers, "EMP-OTHER-CO")
    assert response.status_code == 404
    assert response.json()["detail"] == "Guard not found"


def test_edit_rejects_invalid_fields():
    headers = auth()
    employee_id = add_guard(headers)
    assert edit(headers, employee_id, name="A").status_code == 422
    assert edit(headers, employee_id, phone="call me").status_code == 422


def test_edit_changes_name_and_phone_and_logs_the_fields():
    headers = auth()
    employee_id = add_guard(headers)
    before = headcount("loc-hsr")
    response = edit(headers, employee_id, name="Edited Name", phone="+91 97100 00002")
    assert response.status_code == 200
    assert response.json()["name"] == "Edited Name" and response.json()["warning"] is None
    saved = next(e for e in client.get("/api/employees", headers=headers).json() if e["id"] == employee_id)
    assert (saved["name"], saved["phone"], saved["location_id"]) == ("Edited Name", "+91 97100 00002", "loc-hsr")
    assert headcount("loc-hsr") == before
    assert audit_rows(employee_id, "employee.update") == [{"employee_id": employee_id, "fields": ["name", "phone"]}]
    assert audit_rows(employee_id, "employee.transfer") == []


def test_edit_with_no_change_logs_nothing():
    headers = auth()
    employee_id = add_guard(headers)
    assert edit(headers, employee_id).status_code == 200
    assert audit_rows(employee_id, "employee.update") == []


def test_site_move_changes_both_headcounts_and_logs_a_transfer():
    headers = auth()
    employee_id = add_guard(headers)
    hsr, wf = headcount("loc-hsr"), headcount("loc-whitefield")
    assert edit(headers, employee_id, location_id="loc-whitefield").status_code == 200
    assert (headcount("loc-hsr"), headcount("loc-whitefield")) == (hsr - 1, wf + 1)
    assert audit_rows(employee_id, "employee.transfer") == [
        {"employee_id": employee_id, "from": "loc-hsr", "to": "loc-whitefield"}
    ]
    # No site: the guard waits for a new site.
    assert edit(headers, employee_id, location_id=None).status_code == 200
    assert headcount("loc-whitefield") == wf


def test_edit_blocks_disabled_guard_disabled_site_and_open_check_in():
    headers = auth()
    employee_id = add_guard(headers)
    # Open check-in: the name can change, but the site cannot.
    assert (
        client.post(
            "/api/attendance/checkin", headers=headers, json={"employee_id": employee_id, "location_id": "loc-hsr"}
        ).status_code
        == 200
    )
    assert edit(headers, employee_id, name="Still Here").status_code == 200
    moved = edit(headers, employee_id, location_id="loc-whitefield")
    assert moved.status_code == 409 and "check-out" in moved.json()["detail"]
    assert (
        client.post(
            "/api/attendance/checkout", headers=headers, json={"employee_id": employee_id, "location_id": "loc-hsr"}
        ).status_code
        == 200
    )
    # Disabled site.
    with engine.begin() as c:
        c.execute(text("UPDATE demo_locations SET active=0 WHERE id='loc-mysuru'"))
    try:
        assert edit(headers, employee_id, location_id="loc-mysuru").status_code == 409
    finally:
        with engine.begin() as c:
            c.execute(text("UPDATE demo_locations SET active=1 WHERE id='loc-mysuru'"))
    assert edit(headers, employee_id, location_id="loc-nowhere").status_code == 404
    # Disabled guard.
    assert client.delete(f"/api/employees/{employee_id}", headers=headers).status_code == 200
    disabled = edit(headers, employee_id, name="Other Name")
    assert disabled.status_code == 409 and "Enable this guard first" in disabled.json()["detail"]


def test_edit_warns_about_a_duplicate_phone():
    headers = auth()
    employee_id = add_guard(headers)
    response = edit(headers, employee_id, phone="+91 90000 11024")
    assert response.status_code == 200
    assert "EMP1024" in response.json()["warning"]
