"""Browser tests for the React Guards screen at /next/employees.

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


def guard(n, active=1, location="loc-hsr"):
    return {
        "id": f"EMP{1000 + n}",
        "name": f"Guard Number {n} With A Long Family Name",
        "phone": f"+91 90000 1{n:04d}",
        "role": "Guard",
        "location_id": location,
        "active": active,
    }


GUARDS = [guard(n) for n in range(1, 61)] + [guard(61, active=0), guard(62, location=None)]


def open_guards(p, path="/employees", width=390):
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": width, "height": 844})
    page.add_init_script(
        "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
        + json.dumps(USER)
        + "))"
    )
    answers = {"/api/employees": GUARDS, "/api/locations": SITES}

    def respond(route):
        if fulfill_next(route):
            return
        body = answers.get(urlsplit(route.request.url).path)
        if body is None:
            return route.fulfill(status=404, content_type="application/json", body='{"detail":"Not found"}')
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

    page.route("http://guardian.test/**", respond)
    page.goto("http://guardian.test/next" + path)
    page.get_by_text("61 guards").wait_for()
    return browser, page


def test_guards_layout_targets_and_sticky_search(tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_guards(p)
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        for item in page.locator("main button, main summary, main label, nav a").all():
            box = item.bounding_box()
            if box and box["width"]:
                assert box["height"] >= 44, item.inner_text()
                assert box["x"] >= 0 and box["x"] + box["width"] <= 390
        page.screenshot(path=str(tmp_path / "guards.png"))
        # The search stays at the top after a long scroll.
        page.mouse.wheel(0, 3000)
        page.wait_for_timeout(300)
        search = page.get_by_role("searchbox", name="Search guards by name or guard ID")
        assert 0 <= search.bounding_box()["y"] < 80
        search.fill("1061")
        page.get_by_text("1 guard found").wait_for()
        page.get_by_role("button", name="Enable Guard Number 61 With A Long Family Name").wait_for()
        browser.close()


def test_edit_sheet_fits_the_phone(tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_guards(p)
        page.get_by_role("button", name="Edit Guard Number 1 With A Long Family Name, EMP1001, HSR Layout").click()
        sheet = page.get_by_role("dialog", name="Edit Guard Number 1 With A Long Family Name")
        sheet.wait_for()
        page.wait_for_timeout(400)
        box = sheet.bounding_box()
        assert box["y"] >= 0 and box["y"] + box["height"] <= 844
        disable = sheet.get_by_role("button", name="Disable guard")
        assert disable.bounding_box()["y"] + disable.bounding_box()["height"] <= 844
        for field in ("Name", "Phone", "Site"):
            assert sheet.get_by_label(field).bounding_box()["height"] >= 44
        page.screenshot(path=str(tmp_path / "guard-edit.png"))
        browser.close()


def test_guards_on_a_wide_screen():
    with playwright.sync_playwright() as p:
        browser, page = open_guards(p, width=1280)
        card = page.get_by_role("button", name="Edit Guard Number 1 With A Long Family Name, EMP1001, HSR Layout")
        before = card.evaluate("e => getComputedStyle(e).backgroundColor")
        card.hover()
        page.wait_for_timeout(250)
        assert card.evaluate("e => getComputedStyle(e).backgroundColor") != before
        browser.close()
