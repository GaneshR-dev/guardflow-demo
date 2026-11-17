"""An admin time edit cannot go past the end of the site's shift.

Unit tests cover shift_window() (which shift a check-in belongs to). API tests call
PATCH /api/attendance/times against the seeded in-memory demo database. HSR Layout has a
09:00-18:00 shift. Each test puts back the record that it changes.
"""

import os
import sys
from datetime import date, datetime, timedelta

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.dirname(__file__))
from demo_app import app, local_today, shift_window
from demo_db import LOCAL_TZ, engine
from fastapi.testclient import TestClient
from shift_helpers import temporary_shifts

client = TestClient(app)
DAY = date(2026, 11, 17)


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def at(day_offset, hhmm):
    hour, minute = (int(x) for x in hhmm.split(":"))
    return datetime(DAY.year, DAY.month, DAY.day, hour, minute, tzinfo=LOCAL_TZ) + timedelta(days=day_offset)


# ---- Unit tests: shift_window ----


def test_no_shift_means_no_window():
    assert shift_window([], DAY, "09:00") is None


def test_day_shift_and_early_check_in():
    shifts = [{"shift_start": "09:00", "shift_end": "18:00"}]
    assert shift_window(shifts, DAY, "09:10") == (at(0, "09:00"), at(0, "18:00"))
    assert shift_window(shifts, DAY, "08:40") == (at(0, "09:00"), at(0, "18:00"))


def test_overnight_shift_late_evening_and_after_midnight():
    shifts = [{"shift_start": "22:00", "shift_end": "06:00"}]
    assert shift_window(shifts, DAY, "22:10") == (at(0, "22:00"), at(1, "06:00"))
    # A check-in at 01:00 belongs to the shift that started the evening before.
    assert shift_window(shifts, DAY, "01:00") == (at(-1, "22:00"), at(0, "06:00"))


def test_two_shifts_pick_the_nearest_start():
    shifts = [{"shift_start": "06:00", "shift_end": "14:00"}, {"shift_start": "14:00", "shift_end": "22:00"}]
    assert shift_window(shifts, DAY, "06:05") == (at(0, "06:00"), at(0, "14:00"))
    assert shift_window(shifts, DAY, "13:50") == (at(0, "14:00"), at(0, "22:00"))
    # A tie goes to the earlier start.
    assert shift_window(shifts, DAY, "10:00") == (at(0, "06:00"), at(0, "14:00"))


# ---- API tests ----


def target_record(headers):
    rows = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()["rows"]
    row = next(r for r in rows if r["status"] == "checked_in" and r["check_in"])
    return row


def edit(headers, row, **values):
    body = {
        "employee_id": row["employee_id"],
        "location_id": "loc-hsr",
        "day": local_today().isoformat(),
        "reason": "shift rule test",
        **values,
    }
    return client.patch("/api/attendance/times", headers=headers, json=body)


def restore(headers, row):
    original = datetime.fromisoformat(row["check_in"]).astimezone(LOCAL_TZ).strftime("%H:%M")
    assert edit(headers, row, check_in=original).status_code == 200


def test_check_out_at_the_shift_end_is_allowed_and_one_minute_later_is_not():
    headers = auth()
    row = target_record(headers)
    try:
        assert edit(headers, row, check_in="09:00", check_out="18:00").status_code == 200
        late = edit(headers, row, check_in="09:00", check_out="18:01")
        assert late.status_code == 400
        assert late.json()["detail"] == "Check-out must be at or before the shift end (6:00 pm)."
    finally:
        restore(headers, row)


def test_check_in_after_the_shift_end_is_refused():
    headers = auth()
    row = target_record(headers)
    late = edit(headers, row, check_in="18:30")
    assert late.status_code == 400
    assert late.json()["detail"] == "Check-in is after the shift end (6:00 pm). Check the time."


def test_overnight_shift_next_day_check_out_is_worked_out_and_limited():
    headers = auth()
    row = target_record(headers)
    next_day = (local_today() + timedelta(days=1)).isoformat()
    try:
        with temporary_shifts(engine, "loc-hsr", [("22:00", "06:00")]):
            ok = edit(headers, row, check_in="22:05", check_out="05:50")
            assert ok.status_code == 200
            assert ok.json()["check_out_day"] == next_day
            late = edit(headers, row, check_in="22:05", check_out="06:30")
            assert late.status_code == 400
            assert late.json()["detail"] == "Check-out must be at or before the shift end (6:00 am)."
    finally:
        restore(headers, row)


def test_site_with_no_shift_has_no_limit():
    headers = auth()
    row = target_record(headers)
    try:
        with temporary_shifts(engine, "loc-hsr", []):
            assert edit(headers, row, check_in="09:00", check_out="21:00").status_code == 200
    finally:
        restore(headers, row)


def test_error_codes_still_work():
    headers = auth()
    row = target_record(headers)
    assert client.patch("/api/attendance/times", json={}).status_code in (401, 422)
    unsigned = client.patch(
        "/api/attendance/times",
        json={
            "employee_id": row["employee_id"],
            "location_id": "loc-hsr",
            "day": local_today().isoformat(),
            "check_in": "09:00",
            "reason": "shift rule test",
        },
    )
    assert unsigned.status_code == 401
    assert edit(auth("supervisor.demo"), row, check_in="09:00").status_code == 403
    missing = client.patch(
        "/api/attendance/times",
        headers=headers,
        json={
            "employee_id": "EMP-NOPE",
            "location_id": "loc-hsr",
            "day": local_today().isoformat(),
            "check_in": "09:00",
            "reason": "shift rule test",
        },
    )
    assert missing.status_code == 404
    assert edit(headers, row, check_in="25:00").status_code == 422
