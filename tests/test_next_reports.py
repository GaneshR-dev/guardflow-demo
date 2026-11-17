"""Browser tests for the React Reports screen at /next/reports.

Optional: pip install playwright; playwright install chromium. Build the app first:
cd frontend && npm run build. The tests skip when Playwright or the build is missing.
"""

import json
import os
import sys
from urllib.parse import urlsplit

import pytest

sys.path.insert(0, os.path.dirname(__file__))
from next_app import DIST, fulfill_next
from test_next_attendance import SITES

playwright = pytest.importorskip("playwright.sync_api")
if not (DIST / "index.html").is_file():
    pytest.skip("frontend/dist is not built", allow_module_level=True)

USER = {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "company_id": "c1"}


def row(i, status):
    return {
        "day": "2026-11-17",
        "employee_id": f"EMP{1000 + i}",
        "employee_name": f"Guard {i:02d} with a long name",
        "location_id": "loc-hsr",
        "location_name": "Bengaluru - HSR Layout",
        "status": status,
        "check_in": None if status == "not_in" else "2026-11-17T03:34:00Z",
        "check_out": "2026-11-17T12:32:00Z" if status == "completed" else None,
        "hours": 9.0 if status == "completed" else None,
    }


DAY = {
    "month": "2026-11",
    "day": "2026-11-17",
    "rows": [row(i, s) for i, s in enumerate(["not_in", "checked_in", "completed"] * 4)],
}
ANSWERS = {"/api/locations": SITES, "/api/reports/monthly": DAY}


def test_reports_day_at_phone_width(tmp_path):
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.add_init_script(
            "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
            + json.dumps(USER)
            + "))"
        )

        def respond(route):
            if fulfill_next(route):
                return
            body = ANSWERS.get(urlsplit(route.request.url).path)
            if body is None:
                return route.fulfill(status=404, content_type="application/json", body='{"detail":"Not found"}')
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

        page.route("http://guardian.test/**", respond)
        page.goto("http://guardian.test/next/reports?date=2026-11-17")
        page.get_by_role("group", name="Filter entries by status").wait_for()
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        for item in page.locator("main button, main a, main label").all():
            box = item.bounding_box()
            if box:
                assert box["height"] >= 44, item.inner_text()
        # The date button has the native date input over it, so a tap opens the phone's picker.
        date_input = page.locator("input[type=date]")
        assert date_input.get_attribute("aria-label") == "Change date, now Tue 17 Nov"
        box = date_input.bounding_box()
        assert box["width"] >= 100 and box["height"] >= 44
        page.screenshot(path=str(tmp_path / "reports-day.png"), full_page=True)
        browser.close()
