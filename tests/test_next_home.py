"""Browser tests for the React Home screen at /next/home.

Optional: pip install playwright; playwright install chromium. Build the app first:
cd frontend && npm run build. The tests skip when Playwright or the build is missing.
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
from next_app import DIST, fulfill_next

playwright = pytest.importorskip("playwright.sync_api")

if not (DIST / "index.html").is_file():
    pytest.skip("frontend/dist is not built", allow_module_level=True)

USER = {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "company_id": "c1"}


def location(id_, name, today, active=1, start="00:00", end="23:59"):
    return {
        "id": id_,
        "name": "Bengaluru - " + name,
        "area": "Area",
        "assigned_count": sum(today),
        "active": active,
        "shifts": [{"shift_start": start, "shift_end": end}],
        "today": {"checked_in": today[0], "completed": today[1], "not_in": today[2]},
    }


DASH = {
    "day": "2026-11-17",
    "employees": 54,
    "checked_in": 16,
    "completed": 3,
    "not_checked_in": 35,
    "locations": [
        location("loc-hsr", "HSR Layout", [16, 3, 5]),
        location("loc-wf", "Whitefield Tech Park North Gate", [0, 0, 18]),
        location("loc-old", "Old Site", [0, 0, 0], active=0),
    ],
}


def open_home(p, body=DASH, status=200):
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
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body))

    page.route("http://guardian.test/**", respond)
    page.goto("http://guardian.test/next/home")
    return browser, page


def test_home_layout_at_phone_width(tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_home(p)
        page.get_by_role("region", name="Today's summary").wait_for()
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        for card in page.locator("a[href^='/next/attendance?location=']").all():
            box = card.bounding_box()
            assert box["height"] >= 44
            assert box["x"] >= 0 and box["x"] + box["width"] <= 390
        refresh = page.get_by_role("button", name="Refresh").bounding_box()
        assert refresh["width"] >= 44 and refresh["height"] >= 44
        # The last card must not hide under the bottom navigation.
        page.mouse.wheel(0, 2000)
        nav_top = page.get_by_role("navigation", name="Main").bounding_box()["y"]
        last = page.locator("a[href^='/next/attendance?location=']").last.bounding_box()
        assert last["y"] + last["height"] <= nav_top
        page.screenshot(path=str(tmp_path / "home.png"), full_page=True)
        browser.close()


def test_home_server_error_shows_try_again():
    with playwright.sync_playwright() as p:
        browser, page = open_home(p, {"detail": "Traceback secret"}, status=500)
        alert = page.get_by_role("alert")
        alert.wait_for()
        assert "Could not load the overview" in alert.inner_text()
        assert "Traceback" not in page.content()
        assert page.get_by_role("button", name="Try again").is_visible()
        browser.close()
