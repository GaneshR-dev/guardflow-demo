"""Regression tests for report labels, scoped audit names, and the root entry."""

import json
import os
import sys
import uuid

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import app, engine
from fastapi.testclient import TestClient
from sqlalchemy import text

client = TestClient(app)


def auth(user="admin.demo"):
    response = client.post("/api/login", json={"username": user, "password": "demo123"})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def test_root_redirects_to_the_existing_app_without_authentication():
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/app"
    response = client.get("/")
    assert response.status_code == 200
    assert "Guardian" in response.text
    assert 'src="/attendance-app.js?v=' in response.text
    assert client.get("/api/not-a-route").status_code == 404


@pytest.fixture
def named_audit():
    suffix = uuid.uuid4().hex
    employee_id, location_id = "review-emp-" + suffix, "review-loc-" + suffix
    audit_id, foreign_id = "review-audit-" + suffix, "review-foreign-" + suffix
    headers = auth()
    with engine.begin() as c:
        company = c.execute(text("SELECT company_id FROM demo_users WHERE id='admin.demo'")).scalar_one()
        c.execute(
            text(
                "INSERT INTO demo_locations (id,name,area,assigned_count,active,company_id) "
                "VALUES (:id,'Sample Gate','Test',0,0,:company)"
            ),
            {"id": location_id, "company": company},
        )
        for eid, name, scope in [
            (employee_id, "Sample Guard", company),
            (foreign_id, "Private Other Guard", "other-company"),
        ]:
            c.execute(
                text(
                    "INSERT INTO demo_employees (id,name,phone,role,active,company_id) "
                    "VALUES (:id,:name,'','Guard',0,:company)"
                ),
                {"id": eid, "name": name, "company": scope},
            )
        details = {"employee_id": employee_id, "location_id": location_id, "from": location_id, "to": "missing-site"}
        c.execute(
            text("INSERT INTO demo_audit VALUES (:id,:at,'admin.demo','attendance.checkin',:details)"),
            {"id": audit_id, "at": "2099-01-01T00:00:00+00:00", "details": json.dumps(details)},
        )
        c.execute(text("INSERT INTO demo_audit_scope VALUES (:id,:company)"), {"id": audit_id, "company": company})
    yield headers, audit_id, employee_id, location_id, foreign_id, details
    with engine.begin() as c:
        c.execute(text("DELETE FROM demo_audit_scope WHERE audit_id=:id"), {"id": audit_id})
        c.execute(text("DELETE FROM demo_audit WHERE id=:id"), {"id": audit_id})
        c.execute(
            text("DELETE FROM demo_employees WHERE id IN (:employee,:foreign)"),
            {"employee": employee_id, "foreign": foreign_id},
        )
        c.execute(text("DELETE FROM demo_locations WHERE id=:id"), {"id": location_id})


def test_audit_resolves_disabled_names_without_changing_stored_details_or_csv(named_audit):
    headers, audit_id, employee_id, _, _, details = named_audit
    result = client.get("/api/audit?limit=1", headers=headers)
    assert result.status_code == 200
    row = result.json()["rows"][0]
    assert row["details"] == details
    assert row["labels"] == {
        "employee_name": "Sample Guard",
        "location_name": "Sample Gate",
        "from_name": "Sample Gate",
        "to_name": None,
    }
    with engine.connect() as c:
        stored = c.execute(text("SELECT details FROM demo_audit WHERE id=:id"), {"id": audit_id}).scalar_one()
    assert json.loads(stored) == details
    export = client.get("/api/audit/export", headers=headers)
    assert export.status_code == 200
    assert employee_id in export.text
    assert "employee_name" not in export.text


def test_audit_does_not_resolve_other_company_names(named_audit):
    headers, audit_id, _, _, foreign_id, _ = named_audit
    with engine.begin() as c:
        c.execute(
            text("UPDATE demo_audit SET details=:details WHERE id=:id"),
            {"id": audit_id, "details": json.dumps({"employee_id": foreign_id, "location_id": "unknown-site"})},
        )
    row = client.get("/api/audit?limit=1", headers=headers).json()["rows"][0]
    assert row["labels"]["employee_name"] is None
    assert row["labels"]["location_name"] is None
    assert "Private Other Guard" not in json.dumps(row)


def test_audit_names_keep_access_and_limit_checks():
    assert client.get("/api/audit").status_code == 401
    assert client.get("/api/audit", headers=auth("supervisor.demo")).status_code == 403
    assert client.get("/api/audit?limit=0", headers=auth()).status_code == 422
