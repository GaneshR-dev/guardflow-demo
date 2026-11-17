"""Browser tests for the hover states of the React app (docs/UI-GUIDE.md, "Hover and press states").

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
from test_next_reports import ANSWERS, USER

playwright = pytest.importorskip("playwright.sync_api")
if not (DIST / "index.html").is_file():
    pytest.skip("frontend/dist is not built", allow_module_level=True)

WHITE = "rgb(255, 255, 255)"
SOFT = "rgb(238, 244, 251)"


def open_reports(browser, **context):
    page = browser.new_page(**context)
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
    return page


def bg(locator):
    return locator.evaluate("e => getComputedStyle(e).backgroundColor")


def hovered_bg(page, locator):
    locator.hover()
    page.wait_for_timeout(250)  # the transition is 150 ms
    return bg(locator)


def test_hover_with_a_mouse():
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = open_reports(browser, viewport={"width": 1280, "height": 900})
        site = page.get_by_role("button", name="Change site, now HSR Layout")
        assert bg(site) == WHITE
        assert hovered_bg(page, site) == SOFT
        assert hovered_bg(page, page.get_by_role("button", name="Excel")) == SOFT
        assert hovered_bg(page, page.get_by_role("button", name="4 Not checked in")) == SOFT
        # A selected tile keeps its selected look.
        selected = page.get_by_role("button", name="12 All entries")
        before = bg(selected)
        assert hovered_bg(page, selected) == before
        # A tab: the pill inside it changes.
        month = page.get_by_role("button", name="Month")
        pill = month.locator("span")
        assert bg(pill) == "rgba(0, 0, 0, 0)"
        month.hover()
        page.wait_for_timeout(250)
        assert bg(pill) == "rgba(255, 255, 255, 0.6)"
        # A bottom menu tab that is not the current page.
        assert hovered_bg(page, page.get_by_role("link", name="Home")) == SOFT
        # An input: only the border changes.
        search = page.get_by_role("searchbox", name="Search guards by name or guard ID")
        border = search.evaluate("e => getComputedStyle(e).borderColor")
        search.hover()
        page.wait_for_timeout(250)
        assert search.evaluate("e => getComputedStyle(e).borderColor") != border
        browser.close()


def test_no_hover_look_after_a_tap_on_a_phone():
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = open_reports(browser, viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        assert not page.evaluate("matchMedia('(hover: hover)').matches")
        site = page.get_by_role("button", name="Change site, now HSR Layout")
        site.tap()
        page.get_by_role("dialog").wait_for()
        page.keyboard.press("Escape")
        page.get_by_role("dialog").wait_for(state="hidden")
        assert bg(site) == WHITE
        browser.close()
