"""Each page has the same sections, and each section starts at the same position on every page.

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
from test_next_attendance import ATTENDANCE, SITES
from test_next_home import DASH

playwright = pytest.importorskip("playwright.sync_api")
if not (DIST / "index.html").is_file():
    pytest.skip("frontend/dist is not built", allow_module_level=True)

USER = {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "company_id": "c1"}
ANSWERS = {"/api/dashboard": DASH, "/api/locations": SITES, "/api/attendance": ATTENDANCE}


def positions(page, path):
    page.goto("http://guardian.test/next" + path)
    page.locator("h1").wait_for()
    page.wait_for_timeout(300)
    return page.evaluate(
        """() => {
          const top = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; };
          const title = document.querySelector('[data-section=title]');
          return {
            h1: top('h1'),
            titleHeight: title ? Math.round(title.getBoundingClientRect().height) : null,
            context: top('[data-section=context]'),
            content: top('[data-section=content]'),
          };
        }"""
    )


def test_sections_start_at_the_same_position_on_each_page():
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
        home = positions(page, "/home")
        attendance = positions(page, "/attendance?location=loc-hsr")
        guards = positions(page, "/employees")
        browser.close()

    # Home has no title action and Attendance has one ("Add a guard"): the sections still line up.
    assert home == attendance
    assert home["titleHeight"] == 44
    assert home["context"] - home["h1"] == attendance["context"] - attendance["h1"]
    # A page with no context row: the title is at the same place.
    assert guards["h1"] == home["h1"]
    assert guards["context"] is None
