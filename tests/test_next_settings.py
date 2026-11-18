"""Browser tests for the React Settings screens and the 4-tab menu.

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
SETTINGS = {
    "profile": {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "company_id": "c1"},
    "company": {"id": "c1", "name": "Acme", "active": 1},
    "locations": SITES,
    "access": [
        {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "active": 1, "location_ids": []},
        {"id": "supervisor.demo", "name": "Sup Demo", "role": "supervisor", "active": 1, "location_ids": ["loc-hsr"]},
    ],
}
ANSWERS = {"/api/settings": SETTINGS, "/api/employees": [], "/api/audit": {"rows": []}}


def open_page(p, path):
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
    page.goto("http://guardian.test/next" + path)
    page.locator("h1").wait_for()
    return browser, page


def targets_ok(page):
    for item in page.locator("main a, main button, nav a").all():
        box = item.bounding_box()
        if box:
            assert box["height"] >= 44, item.inner_text()
    assert page.evaluate("document.documentElement.scrollWidth") <= 390


def test_four_tabs_and_settings_home(tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_page(p, "/settings")
        page.get_by_role("link", name="Sites 2", exact=True).wait_for()
        tabs = page.get_by_role("navigation", name="Main").get_by_role("link")
        assert tabs.all_inner_texts() == ["Home", "Attendance", "Reports", "Settings"]
        for tab in tabs.all():
            assert tab.bounding_box()["width"] >= 90
        targets_ok(page)
        page.screenshot(path=str(tmp_path / "settings.png"), full_page=True)
        browser.close()


def test_sub_screens_have_a_back_button_and_keep_the_title_place():
    with playwright.sync_playwright() as p:
        browser, page = open_page(p, "/settings")
        home_h1 = page.locator("h1").bounding_box()["y"]
        for path, title in [("/settings/profile", "My profile"), ("/settings/access", "User access")]:
            page.goto("http://guardian.test/next" + path)
            page.get_by_role("heading", name=title).wait_for()
            page.wait_for_timeout(200)
            assert page.locator("h1").bounding_box()["y"] == home_h1
            back = page.get_by_role("link", name="Back to Settings").bounding_box()
            assert back["width"] >= 44 and back["height"] >= 44
            targets_ok(page)
        page.get_by_role("link", name="Back to Settings").click()
        page.wait_for_url("**/next/settings")
        browser.close()
