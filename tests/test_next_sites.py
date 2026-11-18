"""Browser tests for the React Sites screens at /next/locations and /next/locations/:id.

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

playwright = pytest.importorskip("playwright.sync_api")
if not (DIST / "index.html").is_file():
    pytest.skip("frontend/dist is not built", allow_module_level=True)

USER = {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "company_id": "c1"}


def site(n, active=1):
    return {
        "id": f"loc-{n}",
        "name": f"Bengaluru - Site Number {n} With A Long Name",
        "area": "Area",
        "assigned_count": n,
        "disabled_count": 0,
        "active": active,
        "shifts": [{"label": None, "shift_start": "22:00", "shift_end": "06:00"}],
    }


SITES = [site(n) for n in range(1, 31)] + [site(31, active=0)]
SETTINGS = {
    "profile": {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "company_id": "c1"},
    "company": {"id": "c1", "name": "Acme", "active": 1},
    "locations": SITES,
    "access": [{"id": "supervisor.demo", "name": "Sup Demo", "role": "supervisor", "active": 1, "location_ids": []}],
}


def open_page(p, path):
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.add_init_script(
        "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
        + json.dumps(USER)
        + "))"
    )
    answers = {"/api/locations": SITES, "/api/settings": SETTINGS}

    def respond(route):
        if fulfill_next(route):
            return
        body = answers.get(urlsplit(route.request.url).path)
        if body is None:
            return route.fulfill(status=404, content_type="application/json", body='{"detail":"Not found"}')
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

    page.route("http://guardian.test/**", respond)
    page.goto("http://guardian.test/next" + path)
    page.locator("h1").wait_for()
    return browser, page


def targets_ok(page, width=390):
    assert page.evaluate("document.documentElement.scrollWidth") <= width
    for item in page.locator("main a, main button, main summary, main label, nav a").all():
        box = item.bounding_box()
        if box and box["width"]:
            assert box["height"] >= 44, item.inner_text()
            assert box["x"] >= 0 and box["x"] + box["width"] <= width


def test_sites_list_targets_and_sticky_search(tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_page(p, "/locations")
        page.get_by_text("30 sites").wait_for()
        targets_ok(page)
        page.screenshot(path=str(tmp_path / "sites.png"))
        page.mouse.wheel(0, 3000)
        page.wait_for_timeout(300)
        search = page.get_by_role("searchbox", name="Search sites by name or area")
        assert 0 <= search.bounding_box()["y"] < 80
        browser.close()


def test_site_screen_layout(tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_page(p, "/locations/loc-3")
        page.get_by_role("link", name="Mark attendance here").wait_for()
        targets_ok(page)
        assert "Ends the next day" in page.get_by_role("region", name="Shifts").inner_text()
        page.screenshot(path=str(tmp_path / "site.png"))
        browser.close()


def test_add_sheet_with_five_shifts_fits_and_scrolls(tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_page(p, "/locations?add=1")
        sheet = page.get_by_role("dialog", name="Add a site")
        sheet.wait_for()
        for _ in range(4):
            sheet.get_by_role("button", name="Add a shift").click()
        assert sheet.get_by_role("button", name="Add a shift").count() == 0
        assert sheet.get_by_text("5/5").is_visible()
        page.wait_for_timeout(400)
        box = sheet.bounding_box()
        assert box["y"] >= 0 and box["y"] + box["height"] <= 844
        for field in sheet.locator("input[type=time]").all():
            assert field.bounding_box()["height"] >= 44
        add = sheet.get_by_role("button", name="Add site")
        add.scroll_into_view_if_needed()
        assert add.is_visible()
        page.screenshot(path=str(tmp_path / "add-site.png"))
        browser.close()
