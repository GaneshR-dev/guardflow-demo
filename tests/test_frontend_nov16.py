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


def fulfill_frontend(route):
    match = ASSETS.get(urlsplit(route.request.url).path)
    if not match:
        return False
    content_type, body = match
    route.fulfill(content_type=content_type, body=body)
    return True


def open_page(p, user, responder):
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.add_init_script(
        "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
        + json.dumps(user)
        + "))"
    )
    page.route("http://guardian.test/**", responder)
    page.goto("http://guardian.test/app")
    return browser, page


def test_stale_open_checkout_shows_real_hours_not_zero(tmp_path):
    # Overnight defect of 2026-11-15: the today's-list row for the employee is a LEFT
    # JOIN shell with check_in NULL. The dialog must use the stale open record instead.
    user = {"id": "supervisor.demo", "name": "Supervisor Demo", "role": "supervisor"}
    check_in = (datetime.now(timezone.utc) - timedelta(hours=2, minutes=5)).isoformat()
    stale_day = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    shell_row = {
        "employee_id": "EMP9003",
        "name": "Night Guard",
        "status": "not_in",
        "check_in": None,
        "check_out": None,
    }
    stale_row = {
        "day": stale_day,
        "employee_id": "EMP9003",
        "name": "Night Guard",
        "check_in": check_in,
        "location_id": "loc-test",
    }

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        body = {
            "/api/locations": [
                {"id": "loc-test", "name": "Test Branch", "area": "Area", "assigned_count": 1, "active": 1}
            ],
            "/api/attendance": {
                "rows": [shell_row],
                "summary": {"checked_in": 0, "completed": 0, "not_in": 1},
                "stale_open": [stale_row],
            },
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser, page = open_page(p, user, respond)
        page.wait_for_selector("#attSearch")
        page.locator("[data-go=checkout]").click()
        page.wait_for_selector("[data-checkout]")
        page.wait_for_function("document.body.innerText.includes('Left open from earlier days')")
        page.locator("[data-checkout]").first.click()
        page.wait_for_selector("#confirmOk")
        modal = page.locator(".modalCard").inner_text()
        assert "Night Guard (EMP9003)" in modal
        assert "Hours worked" in modal
        assert "2h 05m" in modal
        assert "0h 00m" not in modal
        page.locator("#confirmCancel").click()
        browser.close()
