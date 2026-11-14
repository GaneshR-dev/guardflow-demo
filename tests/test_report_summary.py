"""Unit and integration tests for the month summary behind the Reports screen.

Unit tests cover the counting helpers (_new_bucket, _tally, _finish) without HTTP or
a database. Integration tests call GET /api/reports/summary against the seeded
in-memory demo database and compare it with the other attendance endpoints.
"""

import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import _finish, _new_bucket, _tally, app, local_today
from fastapi.testclient import TestClient

client = TestClient(app)


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def row(status, check_in=None, check_out=None):
    return {"status": status, "check_in": check_in, "check_out": check_out}


# ---- Unit tests: counting helpers ----


def test_new_bucket_starts_at_zero_and_keeps_extra_fields():
    bucket = _new_bucket(id="loc-x", day="2026-11-14")
    assert bucket["records"] == bucket["completed"] == bucket["checked_in"] == bucket["not_in"] == 0
    assert bucket["_hours"] == []
    assert bucket["id"] == "loc-x" and bucket["day"] == "2026-11-14"
    # Each call returns a new hours list, so buckets never share state.
    assert _new_bucket()["_hours"] is not _new_bucket()["_hours"]


def test_tally_counts_records_and_statuses():
    bucket = _new_bucket()
    for status in ["completed", "checked_in", "checked_in", "not_in"]:
        _tally(bucket, row(status))
    assert bucket["records"] == 4
    assert (bucket["completed"], bucket["checked_in"], bucket["not_in"]) == (1, 2, 1)


def test_tally_adds_hours_only_for_a_valid_shift():
    bucket = _new_bucket()
    _tally(bucket, row("completed", "2026-11-10T03:00:00+00:00", "2026-11-10T12:00:00+00:00"))  # 9 h
    _tally(bucket, row("checked_in", "2026-11-10T03:00:00+00:00"))  # no check-out yet
    _tally(bucket, row("completed", "2026-11-10T12:00:00+00:00", "2026-11-10T03:00:00+00:00"))  # out before in
    _tally(bucket, row("not_in"))
    assert bucket["_hours"] == [9.0]
    assert bucket["records"] == 4


def test_finish_rounds_average_to_one_decimal_and_drops_work_list():
    bucket = _new_bucket()
    bucket["_hours"] = [8.0, 9.0, 9.17]
    result = _finish(bucket)
    assert result["avg_hours"] == 8.7  # 26.17 / 3 = 8.723
    assert "_hours" not in result


def test_finish_without_hours_gives_none():
    result = _finish(_new_bucket(records=3, not_in=3))
    assert result["avg_hours"] is None


# ---- Integration tests: GET /api/reports/summary ----


def test_summary_for_a_month_without_data():
    body = client.get("/api/reports/summary?month=2020-01", headers=auth()).json()
    assert body["totals"] == {"records": 0, "completed": 0, "checked_in": 0, "not_in": 0, "avg_hours": None}
    assert body["days"] == []
    assert body["locations"] and all(loc["records"] == 0 for loc in body["locations"])


def test_summary_needs_sign_in_and_a_known_location():
    month = local_today().isoformat()[:7]
    assert client.get(f"/api/reports/summary?month={month}").status_code == 401
    assert client.get(f"/api/reports/summary?month={month}&location_id=loc-missing", headers=auth()).status_code == 404


def test_location_detail_today_matches_attendance_summary():
    headers = auth("supervisor.demo")
    today = local_today().isoformat()
    attendance = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()["summary"]
    detail = client.get(f"/api/reports/summary?month={today[:7]}&location_id=loc-hsr", headers=headers).json()
    today_row = next(d for d in detail["days"] if d["day"] == today)
    # Only stored records are compared. Attendance also counts employees with no record
    # today as "not in"; the reports count stored rows only, so "not_in" can differ.
    assert {k: today_row[k] for k in ("checked_in", "completed")} == {
        k: attendance[k] for k in ("checked_in", "completed")
    }


def test_location_detail_day_counts_match_monthly_rows():
    headers = auth("supervisor.demo")
    month = local_today().isoformat()[:7]
    detail = client.get(f"/api/reports/summary?month={month}&location_id=loc-hsr", headers=headers).json()
    for day in detail["days"][:3]:
        rows = client.get(
            f"/api/reports/monthly?month={month}&day={day['day']}&location_id=loc-hsr", headers=headers
        ).json()["rows"]
        assert day["records"] == len(rows)
        assert day["completed"] == sum(r["status"] == "completed" for r in rows)


def test_summary_follows_a_check_in_and_check_out():
    # Uses Whitefield: other tests expect exact numbers for HSR Layout today.
    headers = auth("supervisor.demo")
    month = local_today().isoformat()[:7]
    url = f"/api/reports/summary?month={month}&location_id=loc-whitefield"
    attendance = client.get("/api/attendance?location_id=loc-whitefield", headers=headers).json()["rows"]
    waiting = next(r for r in attendance if r["status"] == "not_in")
    body = {"employee_id": waiting["employee_id"], "location_id": "loc-whitefield"}

    start = client.get(url, headers=headers).json()["totals"]
    assert client.post("/api/attendance/checkin", headers=headers, json=body).status_code == 200
    checked_in = client.get(url, headers=headers).json()["totals"]
    assert checked_in["records"] == start["records"] + 1
    assert checked_in["checked_in"] == start["checked_in"] + 1

    assert client.post("/api/attendance/checkout", headers=headers, json=body).status_code == 200
    done = client.get(url, headers=headers).json()["totals"]
    assert done["completed"] == checked_in["completed"] + 1
    assert done["checked_in"] == checked_in["checked_in"] - 1
    assert done["records"] == checked_in["records"]
