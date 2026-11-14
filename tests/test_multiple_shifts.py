"""Multiple shift timings per branch: create, list, replace, legacy compatibility, migration."""

import os
import subprocess
import sys
import tempfile
import threading

# Overridable so the same suite can run against an isolated PostgreSQL for the
# concurrency and migration evidence (see the forced-overlap regression below).
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import pytest
from demo_app import app
from demo_db import _migrate_schema, engine
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

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
        # Full-row snapshots, not counts: user credentials, supervisor grants, employees,
        # attendance history, the audit log and locations must survive byte-identical.
        tables = (
            "demo_users",
            "demo_user_locations",
            "demo_employees",
            "demo_attendance",
            "demo_audit",
            "demo_locations",
        )
        snapshots = {t: c.execute(text(f"SELECT * FROM {t} ORDER BY 1")).all() for t in tables}
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
        # Business rows are untouched by the migration, byte-identical.
        for table, before in snapshots.items():
            assert c.execute(text(f"SELECT * FROM {table} ORDER BY 1")).all() == before, table


def test_shift_set_validation_rejects_bad_writes():
    headers = auth()
    # A PUT without the required "shifts" key is a 422, not a silent clear.
    assert client.put("/api/settings/locations/loc-legacy-pair/shifts", headers=headers, json={}).status_code == 422
    # A zero-length window (start == end) is a data entry error, not a 24h shift.
    assert (
        client.put(
            "/api/settings/locations/loc-legacy-pair/shifts",
            headers=headers,
            json={"shifts": [{"shift_start": "09:00", "shift_end": "09:00"}]},
        ).status_code
        == 422
    )
    # Duplicate windows (same start and end) are one entry typed twice.
    assert (
        client.put(
            "/api/settings/locations/loc-legacy-pair/shifts",
            headers=headers,
            json={
                "shifts": [
                    {"shift_start": "09:00", "shift_end": "17:00"},
                    {"shift_start": "09:00", "shift_end": "17:00"},
                ]
            },
        ).status_code
        == 422
    )
    # The per-branch bound is 5 windows (the slot limit in the picked UI reference).
    too_many = [{"shift_start": f"{h:02d}:00", "shift_end": f"{h + 1:02d}:00"} for h in range(6)]
    assert (
        client.put(
            "/api/settings/locations/loc-legacy-pair/shifts", headers=headers, json={"shifts": too_many}
        ).status_code
        == 422
    )
    # Rejected writes change nothing.
    row = location_row(headers, "loc-legacy-pair")
    assert row["shifts"] == [{"label": None, "shift_start": "08:00", "shift_end": "20:00"}]
    assert row["shift_start"] == "08:00" and row["shift_end"] == "20:00"


def test_partial_legacy_pair_rejected_on_create():
    headers = auth()
    for i, extra in enumerate(({"shift_start": "08:00"}, {"shift_end": "20:00"})):
        created = client.post(
            "/api/settings/locations",
            headers=headers,
            json={"id": f"loc-partial-{i}", "name": "Partial Pair", "area": "Area", **extra},
        )
        assert created.status_code == 422, created.text


def test_explicit_empty_shifts_on_create_wins_over_legacy_pair():
    headers = auth()
    created = client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-empty-list",
            "name": "Empty List Branch",
            "area": "Area",
            "shift_start": "08:00",
            "shift_end": "20:00",
            "shifts": [],
        },
    )
    assert created.status_code == 200, created.text
    row = location_row(headers, "loc-empty-list")
    # The explicit empty list wins: no windows, and the legacy columns stay NULL.
    assert row["shifts"] == []
    assert row["shift_start"] is None and row["shift_end"] is None


def test_cleared_timings_are_not_resurrected_by_migration():
    headers = auth()
    client.post(
        "/api/settings/locations",
        headers=headers,
        json={"id": "loc-clear-me", "name": "Clear Me", "area": "Area", "shift_start": "08:00", "shift_end": "20:00"},
    )
    assert (
        client.put("/api/settings/locations/loc-clear-me/shifts", headers=headers, json={"shifts": []}).status_code
        == 200
    )
    with engine.begin() as c:
        _migrate_schema(c)
    row = location_row(headers, "loc-clear-me")
    # Clearing mirrors NULL into the legacy pair, so the backfill has nothing to copy back.
    assert row["shifts"] == [] and row["shift_start"] is None and row["shift_end"] is None


def test_raw_legacy_pair_edit_does_not_reconcile_children():
    # An old-code style write that touches only the legacy columns while child rows
    # exist: the NOT EXISTS guard never reconciles or overwrites the children. Mixed
    # version writes are unsupported; new code is the only writer of the mirror.
    headers = auth()
    client.post(
        "/api/settings/locations",
        headers=headers,
        json={"id": "loc-raw-edit", "name": "Raw Edit", "area": "Area", "shift_start": "08:00", "shift_end": "20:00"},
    )
    with engine.begin() as c:
        c.execute(text("UPDATE demo_locations SET shift_start='10:00', shift_end='18:00' WHERE id='loc-raw-edit'"))
        _migrate_schema(c)
    row = location_row(headers, "loc-raw-edit")
    assert row["shifts"] == [{"label": None, "shift_start": "08:00", "shift_end": "20:00"}]
    assert row["shift_start"] == "10:00" and row["shift_end"] == "18:00"  # stale pair, deliberately not reconciled


def test_migration_variants_and_position_uniqueness():
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO demo_locations (id,name,area,assigned_count,shift_start,shift_end,active) VALUES "
                "('loc-mig-unset','Unset','Area',0,NULL,NULL,1),"
                "('loc-mig-partial','Partial','Area',0,'08:00',NULL,1),"
                "('loc-mig-disabled','Disabled','Area',0,'07:00','19:00',0)"
            )
        )
        _migrate_schema(c)
        rows = c.execute(
            text("SELECT location_id,position FROM demo_location_shifts WHERE location_id LIKE 'loc-mig-%' ORDER BY 1")
        ).all()
        # Unset and half-set legacy pairs copy nothing; a disabled branch keeps its timing history.
        assert [(r[0], r[1]) for r in rows] == [("loc-mig-disabled", 0)]
        # One row per (location, position) is enforced by the schema itself.
        try:
            c.execute(
                text(
                    "INSERT INTO demo_location_shifts (id,location_id,label,shift_start,shift_end,position) "
                    "VALUES ('dup-row','loc-mig-disabled',NULL,'09:00','10:00',0)"
                )
            )
            raise AssertionError("duplicate (location_id, position) was accepted")
        except IntegrityError:
            pass


def test_deterministic_backfill_id_collision_fails_safely():
    # A row already holding the deterministic backfill id for another branch: the copy
    # fails loudly instead of silently merging, and the migration transaction rolls back.
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO demo_locations (id,name,area,assigned_count,shift_start,shift_end,active) "
                "VALUES ('loc-collision','Collision','Area',0,'07:00','19:00',1)"
            )
        )
        c.execute(
            text(
                "INSERT INTO demo_location_shifts (id,location_id,label,shift_start,shift_end,position) "
                "VALUES ('loc-collision-shift-1','loc-other',NULL,'09:00','10:00',0)"
            )
        )
        before = c.execute(text("SELECT * FROM demo_location_shifts ORDER BY 1")).all()
    try:
        with engine.begin() as c:
            _migrate_schema(c)
        raise AssertionError("the id collision was not detected")
    except IntegrityError:
        pass
    with engine.connect() as c:
        assert c.execute(text("SELECT * FROM demo_location_shifts ORDER BY 1")).all() == before


def test_incompatible_existing_shift_table_fails_boot_safely():
    # CREATE TABLE IF NOT EXISTS is not validation: a pre-existing table with an
    # incompatible shape must stop the boot, not get silently reused. The whole boot
    # is one transaction, so nothing half-applies.
    import sqlite3

    path = tempfile.mktemp(suffix=".db")
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE demo_location_shifts (id TEXT PRIMARY KEY)")
    conn.commit()
    conn.close()
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{path}")
    result = subprocess.run(
        [sys.executable, "-c", "import demo_db; demo_db.init_db()"],
        check=False,
        cwd=os.path.join(os.path.dirname(__file__), "..", "backend"),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode != 0, "boot accepted an incompatible demo_location_shifts table"
    conn = sqlite3.connect(path)
    try:
        assert [r[1] for r in conn.execute("PRAGMA table_info(demo_location_shifts)")] == ["id"]
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert "demo_users" not in tables  # whole-transaction rollback, no half-created schema
    finally:
        conn.close()


def test_import_preserves_shift_windows():
    headers = auth()
    client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-import-keep",
            "name": "Import Keep",
            "area": "Area",
            "shifts": [{"shift_start": "06:00", "shift_end": "14:00"}],
        },
    )
    imported = client.post(
        "/api/settings/locations/import",
        headers=headers,
        json={"rows": [{"id": "loc-import-keep", "name": "Import Keep Renamed", "area": "New Area"}]},
    )
    assert imported.status_code == 200, imported.text
    row = location_row(headers, "loc-import-keep")
    assert row["name"] == "Import Keep Renamed"
    assert row["shifts"] == [{"label": None, "shift_start": "06:00", "shift_end": "14:00"}]


def test_disable_and_enable_preserve_windows():
    headers = auth()
    client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-toggle",
            "name": "Toggle",
            "area": "Area",
            "shifts": [{"shift_start": "06:00", "shift_end": "14:00"}],
        },
    )
    assert client.delete("/api/settings/locations/loc-toggle", headers=headers).status_code == 200
    assert client.post("/api/settings/locations/loc-toggle/enable", headers=headers).status_code == 200
    row = location_row(headers, "loc-toggle")
    assert row["shifts"] == [{"label": None, "shift_start": "06:00", "shift_end": "14:00"}]
    assert row["shift_start"] == "06:00" and row["shift_end"] == "14:00"


def test_supervisor_scope_and_write_denials():
    sup = auth("supervisor.demo")
    rows = client.get("/api/locations", headers=sup).json()
    # loc-multi-shift is admin-created with no grant to this supervisor: unreadable,
    # including its shift windows (cross-site read denial).
    assert "loc-multi-shift" not in {r["id"] for r in rows}
    # Every settings write is admin-only.
    assert (
        client.post(
            "/api/settings/locations",
            headers=sup,
            json={"id": "loc-sup-denied", "name": "Denied", "area": "Area"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/settings/locations/import", headers=sup, json={"rows": [{"name": "Denied Row", "area": "Area"}]}
        ).status_code
        == 403
    )
    assert (
        client.put("/api/settings/locations/loc-multi-shift/shifts", headers=sup, json={"shifts": []}).status_code
        == 403
    )
    assert client.delete("/api/settings/locations/loc-multi-shift", headers=sup).status_code == 403
    assert client.post("/api/settings/locations/loc-multi-shift/enable", headers=sup).status_code == 403


@pytest.mark.skipif(engine.dialect.name == "sqlite", reason="requires isolated PostgreSQL connections")
def test_concurrent_replacements_leave_one_consistent_set():
    # Forced-overlap regression: two admins replace one branch's windows at the same
    # time. PostgreSQL gives each request its own connection and the endpoint locks the
    # parent location row FOR UPDATE, so writers serialize: the final state must be
    # exactly one replacement set with the legacy mirror matching its first window.
    # (Skipped on SQLite: demo mode serves all requests over one shared StaticPool
    # connection, so overlapping requests interleave at the driver level - a
    # pre-existing platform-wide demo limitation, not specific to this endpoint.)
    headers = auth()
    client.post(
        "/api/settings/locations",
        headers=headers,
        json={
            "id": "loc-race",
            "name": "Race",
            "area": "Area",
            "shifts": [{"shift_start": "06:00", "shift_end": "14:00"}],
        },
    )
    set_a = [{"label": "A", "shift_start": "01:00", "shift_end": "09:00"}]
    set_b = [
        {"label": "B1", "shift_start": "10:00", "shift_end": "18:00"},
        {"label": "B2", "shift_start": "18:00", "shift_end": "02:00"},
    ]
    option_a = [("A", "01:00", "09:00")]
    option_b = [("B1", "10:00", "18:00"), ("B2", "18:00", "02:00")]
    results = []

    def put(shifts):
        local_client = TestClient(app)
        results.append(
            local_client.put(
                "/api/settings/locations/loc-race/shifts", headers=headers, json={"shifts": shifts}
            ).status_code
        )

    threads = [threading.Thread(target=put, args=(set_a,)), threading.Thread(target=put, args=(set_b,))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    assert sorted(results) == [200, 200], results
    row = location_row(headers, "loc-race")
    got = [(s["label"], s["shift_start"], s["shift_end"]) for s in row["shifts"]]
    # Serialized writers: the final state is exactly one replacement set, never a mix.
    assert got in (option_a, option_b), got
    # And the legacy mirror matches the surviving first window.
    assert row["shift_start"] == got[0][1] and row["shift_end"] == got[0][2]
