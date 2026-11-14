"""Multiple shift timings per branch: create, list, replace, legacy compatibility, migration."""

import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import app
from demo_db import _migrate_schema, engine
from fastapi.testclient import TestClient
from sqlalchemy import text

client = TestClient(app)


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def location_row(headers, location_id):
    rows = client.get("/api/locations", headers=headers).json()
    return next(loc for loc in rows if loc["id"] == location_id)


def test_create_with_multiple_shifts_lists_them_in_order():
    headers = auth()
    created = client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-multi-shift",
            "name": "Multi Shift Branch",
            "area": "Test Area",
            "supervisor_id": None,
            "shifts": [
                {"label": "Morning", "shift_start": "06:00", "shift_end": "14:00"},
                {"label": "Evening", "shift_start": "14:00", "shift_end": "22:00"},
                {"shift_start": "22:00", "shift_end": "06:00"},
            ],
        },
    )
    assert created.status_code == 200, created.text
    row = location_row(headers, "loc-multi-shift")
    assert [(s["label"], s["shift_start"], s["shift_end"]) for s in row["shifts"]] == [
        ("Morning", "06:00", "14:00"),
        ("Evening", "14:00", "22:00"),
        (None, "22:00", "06:00"),
    ]
    # Legacy columns mirror the first window so older readers still show a shift.
    assert row["shift_start"] == "06:00" and row["shift_end"] == "14:00"


def test_replace_shifts_admin_only_and_full_replacement():
    headers = auth()
    sup = auth("supervisor.demo")
    assert (
        client.put(
            "/api/settings/locations/loc-multi-shift/shifts",
            headers=sup,
            json={"shifts": [{"shift_start": "09:00", "shift_end": "17:00"}]},
        ).status_code
        == 403
    )
    assert (
        client.put("/api/settings/locations/loc-unknown/shifts", headers=headers, json={"shifts": []}).status_code
        == 404
    )
    replaced = client.put(
        "/api/settings/locations/loc-multi-shift/shifts",
        headers=headers,
        json={"shifts": [{"label": "Day", "shift_start": "09:00", "shift_end": "17:00"}]},
    )
    assert replaced.status_code == 200, replaced.text
    row = location_row(headers, "loc-multi-shift")
    assert [(s["label"], s["shift_start"], s["shift_end"]) for s in row["shifts"]] == [("Day", "09:00", "17:00")]
    assert row["shift_start"] == "09:00" and row["shift_end"] == "17:00"
    # Clearing works too: an empty set means no timings, and the legacy columns go null.
    assert (
        client.put("/api/settings/locations/loc-multi-shift/shifts", headers=headers, json={"shifts": []}).status_code
        == 200
    )
    row = location_row(headers, "loc-multi-shift")
    assert row["shifts"] == [] and row["shift_start"] is None and row["shift_end"] is None


def test_shift_rows_require_both_times():
    headers = auth()
    bad = client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-bad-window",
            "name": "Bad Window",
            "area": "Area",
            "supervisor_id": None,
            "shifts": [{"label": "Broken", "shift_start": "nine", "shift_end": "17:00"}],
        },
    )
    assert bad.status_code == 422


def test_legacy_pair_create_also_fills_the_shift_table():
    headers = auth()
    created = client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-legacy-pair",
            "name": "Legacy Pair Branch",
            "area": "Area",
            "supervisor_id": None,
            "shift_start": "08:00",
            "shift_end": "20:00",
        },
    )
    assert created.status_code == 200, created.text
    row = location_row(headers, "loc-legacy-pair")
    assert row["shifts"] == [{"label": None, "shift_start": "08:00", "shift_end": "20:00"}]
    assert row["shift_start"] == "08:00" and row["shift_end"] == "20:00"


def test_boot_migration_copies_existing_pairs_once_and_preserves_rows():
    # A branch written the pre-feature way: legacy columns set, no shift rows.
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO demo_locations (id,name,area,assigned_count,shift_start,shift_end,active) "
                "VALUES ('loc-pre-feature','Pre Feature','Area',2,'07:30','19:30',1)"
            )
        )
        employees_before = c.execute(text("SELECT COUNT(*) FROM demo_employees")).scalar()
        attendance_before = c.execute(text("SELECT COUNT(*) FROM demo_attendance")).scalar()
        _migrate_schema(c)
        copied = c.execute(
            text(
                "SELECT label,shift_start,shift_end,position FROM demo_location_shifts WHERE location_id='loc-pre-feature'"
            )
        ).all()
        assert [(r[0], r[1], r[2], r[3]) for r in copied] == [(None, "07:30", "19:30", 0)]
        # Repeat boot: the copy step is idempotent and leaves existing rows alone.
        _migrate_schema(c)
        again = c.execute(
            text("SELECT COUNT(*) FROM demo_location_shifts WHERE location_id='loc-pre-feature'")
        ).scalar()
        assert again == 1
        # Business rows are untouched by the migration.
        assert c.execute(text("SELECT COUNT(*) FROM demo_employees")).scalar() == employees_before
        assert c.execute(text("SELECT COUNT(*) FROM demo_attendance")).scalar() == attendance_before
