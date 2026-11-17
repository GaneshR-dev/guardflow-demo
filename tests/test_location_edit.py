"""API tests for PATCH /api/settings/locations/{id} (edit the name and area of a site) and
for POST /api/settings/locations without an ID (the server makes the ID).

Each test removes the sites it adds, so the tests do not depend on order.
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
        for location_id in _ADDED:
            c.execute(text("DELETE FROM demo_location_shifts WHERE location_id=:l"), {"l": location_id})
            c.execute(text("DELETE FROM demo_user_locations WHERE location_id=:l"), {"l": location_id})
            c.execute(text("DELETE FROM demo_audit WHERE details LIKE :n"), {"n": "%" + location_id + "%"})
            c.execute(text("DELETE FROM demo_locations WHERE id=:l"), {"l": location_id})
    _ADDED.clear()


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def add_site(headers, name="Edit Test - Site One", **extra):
    created = client.post("/api/settings/locations", headers=headers, json={"name": name, "area": "Area 1", **extra})
    assert created.status_code == 200, created.text
    _ADDED.append(created.json()["id"])
    return created.json()["id"]


def audit_rows(location_id, action):
    with engine.connect() as c:
        rows = c.execute(
            text("SELECT details FROM demo_audit WHERE action=:a AND details LIKE :n"),
            {"a": action, "n": "%" + location_id + "%"},
        )
        return [json.loads(r[0]) for r in rows]


def edit(headers, location_id, **body):
    return client.patch(
        f"/api/settings/locations/{location_id}",
        headers=headers,
        json={"name": "Edit Test - Site One", "area": "Area 1", **body},
    )


def test_create_without_an_id_makes_a_unique_id():
    headers = auth()
    first = add_site(headers, name="Edit Test - Same Name")
    second = add_site(headers, name="Edit Test - Same Name")
    assert first == "loc-edit-test-same-name"
    assert second == "loc-edit-test-same-name-2"
    assert audit_rows(first, "settings.location.create")[0]["id"] == first
    # A sent ID still works, and a taken ID is still a 409.
    assert add_site(headers, name="Edit Test - Own Id", id="loc-edit-own") == "loc-edit-own"
    taken = client.post(
        "/api/settings/locations", headers=headers, json={"id": "loc-edit-own", "name": "Again", "area": "Area"}
    )
    assert taken.status_code == 409


def test_edit_needs_sign_in_and_admin():
    headers = auth()
    location_id = add_site(headers)
    assert client.patch(f"/api/settings/locations/{location_id}", json={"name": "Abc", "area": "Ab"}).status_code == 401
    assert edit(auth("supervisor.demo"), "loc-hsr", name="Bengaluru - New").status_code == 403


def test_edit_unknown_or_other_company_site_is_404():
    headers = auth()
    assert edit(headers, "loc-nowhere").status_code == 404
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO demo_locations (id,name,area,assigned_count,active,company_id) "
                "VALUES ('loc-edit-other','Other','Area',0,1,'other-company')"
            )
        )
    _ADDED.append("loc-edit-other")
    response = edit(headers, "loc-edit-other")
    assert response.status_code == 404
    assert response.json()["detail"] == "Site not found"


def test_edit_rejects_invalid_fields():
    headers = auth()
    location_id = add_site(headers)
    assert edit(headers, location_id, name="Ab").status_code == 422
    assert edit(headers, location_id, area="A").status_code == 422


def test_edit_changes_name_and_area_and_logs_the_fields():
    headers = auth()
    location_id = add_site(headers)
    assert edit(headers, location_id).status_code == 200
    assert audit_rows(location_id, "settings.location.update") == []
    response = edit(headers, location_id, name="Edit Test - Renamed", area="Area 2")
    assert response.status_code == 200
    assert response.json() == {"id": location_id, "name": "Edit Test - Renamed", "area": "Area 2"}
    saved = next(r for r in client.get("/api/locations", headers=headers).json() if r["id"] == location_id)
    assert (saved["name"], saved["area"]) == ("Edit Test - Renamed", "Area 2")
    assert audit_rows(location_id, "settings.location.update") == [
        {"location_id": location_id, "fields": ["name", "area"]}
    ]


def test_a_disabled_site_can_be_renamed_and_stays_disabled():
    headers = auth()
    location_id = add_site(headers)
    assert client.delete(f"/api/settings/locations/{location_id}", headers=headers).status_code == 200
    assert edit(headers, location_id, name="Edit Test - Closed").status_code == 200
    saved = next(r for r in client.get("/api/locations", headers=headers).json() if r["id"] == location_id)
    assert saved["active"] == 0 and saved["name"] == "Edit Test - Closed"
