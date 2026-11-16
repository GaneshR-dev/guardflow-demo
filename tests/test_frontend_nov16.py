"""Browser coverage for the Nov 16 overnight check-out fix. Optional: pip install playwright; playwright install chromium."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

import pytest

playwright = pytest.importorskip("playwright.sync_api")
ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "attendance-app.html").read_text()
ASSETS = {
    "/app": ("text/html", HTML),
    "/attendance-app.css": ("text/css", (ROOT / "attendance-app.css").read_text()),
    "/attendance-app.js": ("text/javascript", (ROOT / "attendance-app.js").read_text()),
}
USER = {"id": "supervisor.demo", "name": "Supervisor Demo", "role": "supervisor"}
LOCATIONS = [{"id": "loc-test", "name": "Test Branch", "area": "Area", "assigned_count": 1, "active": 1}]


def fulfill_frontend(route):
    match = ASSETS.get(urlsplit(route.request.url).path)
    if not match:
        return False
    content_type, body = match
    route.fulfill(content_type=content_type, body=body)
    return True


def open_page(p, responder):
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.add_init_script(
        "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
        + json.dumps(USER)
        + "))"
    )
    page.route("http://guardian.test/**", responder)
    page.goto("http://guardian.test/app#attendance")
    return browser, page


def iso(hours_ago, minutes_ago=0):
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago, minutes=minutes_ago)).isoformat()


def stale(days_ago, check_in):
    return {
        "day": (datetime.now(timezone.utc) - timedelta(days=days_ago)).date().isoformat(),
        "employee_id": "EMP9003",
        "name": "Night Guard",
        "check_in": check_in,
        "location_id": "loc-test",
    }


def run_dialog(p, rows, stale_open):
    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        body = {
            "/api/locations": LOCATIONS,
            "/api/attendance": {
                "rows": rows,
                "summary": {"checked_in": 0, "completed": 0, "not_in": 1},
                "stale_open": stale_open,
            },
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    browser, page = open_page(p, respond)
    page.wait_for_selector("#attSearch")
    page.locator("[data-nav=attendance]").click()
    page.locator("[data-go=checkout]").click()
    page.wait_for_selector("[data-checkout]")
    page.locator("[data-checkout]").first.click()
    page.wait_for_selector("#confirmOk")
    modal = page.locator(".modalCard").inner_text()
    page.locator("#confirmCancel").click()
    browser.close()
    return modal


def test_stale_open_checkout_shows_real_hours_not_zero():
    # Overnight defect of 2026-11-15: the today's-list row for the employee is a LEFT
    # JOIN shell with check_in NULL. The dialog must use the stale open record instead.
    shell = {"employee_id": "EMP9003", "name": "Night Guard", "status": "not_in", "check_in": None, "check_out": None}
    with playwright.sync_playwright() as p:
        modal = run_dialog(p, [shell], [stale(1, iso(2, 5))])
    assert "Night Guard (EMP9003)" in modal
    assert "2h 05m" in modal
    assert "0h 00m" not in modal


def test_two_stale_opens_dialog_matches_newest_record():
    # Legacy data can hold two open records; the backend closes the newest open day.
    shell = {"employee_id": "EMP9003", "name": "Night Guard", "status": "not_in", "check_in": None, "check_out": None}
    with playwright.sync_playwright() as p:
        modal = run_dialog(p, [shell], [stale(2, iso(5, 5)), stale(1, iso(2, 5))])
    assert "2h 05m" in modal
    assert "5h 05m" not in modal


def test_mixed_today_and_stale_dialog_uses_today():
    # Legacy mix of a real check-in today and a stale open: the backend closes today's
    # record first, so the dialog must show today's hours, not the stale hours.
    today_open = {
        "employee_id": "EMP9003",
        "name": "Night Guard",
        "status": "checked_in",
        "check_in": iso(0, 30),
        "check_out": None,
    }
    with playwright.sync_playwright() as p:
        modal = run_dialog(p, [today_open], [stale(1, iso(2, 0))])
    assert "0h 30m" in modal
    assert "2h 00m" not in modal
