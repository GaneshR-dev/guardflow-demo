"""Browser tests for the React sign-in screen at /next/login.

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

ADMIN = {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "company_id": "c1"}


def api_responder(login, demo_mode=True, calls=None):
    def respond(route):
        if fulfill_next(route):
            return
        path = urlsplit(route.request.url).path
        if calls is not None:
            calls.append(path)
        if path == "/api/health":
            body = {"status": "ok", "demo_mode": demo_mode}
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
        if path == "/api/login":
            if login == "network":
                return route.abort()
            status, body = login
            return route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
        return route.fulfill(status=404, content_type="application/json", body='{"detail":"Not found"}')

    return respond


def open_login(p, responder, height=844):
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": height})
    page.route("http://guardian.test/**", responder)
    page.goto("http://guardian.test/next/login")
    page.wait_for_selector("#username")
    return browser, page


def test_sign_in_saves_the_session_and_opens_home():
    calls = []
    with playwright.sync_playwright() as p:
        browser, page = open_login(p, api_responder((200, {"token": "t", "user": ADMIN}), calls=calls))
        page.fill("#username", "admin.demo")
        page.fill("#password", "local-test-password")
        page.get_by_role("button", name="Sign in").click()
        page.wait_for_url("**/next/home")
        assert page.evaluate("localStorage.getItem('gf_token')") == "t"
        assert calls.count("/api/login") == 1
        browser.close()


@pytest.mark.parametrize(
    "login,expected",
    [
        ((401, {"detail": "Invalid user ID or password"}), "Wrong password or user ID. Try again."),
        (
            (429, {"detail": "Too many failed sign-in attempts. Try again later."}),
            "Too many failed sign-in attempts. Try again later.",
        ),
        ((503, {"detail": "Service unavailable"}), "The server had a problem. Try again in a moment."),
        ("network", "Cannot reach the Guardian server. Check the connection and try again."),
    ],
)
def test_sign_in_error_feedback(login, expected, tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_login(p, api_responder(login))
        page.fill("#username", "supervisor.demo")
        page.fill("#password", "incorrect-local-test")
        page.get_by_role("button", name="Sign in").click()
        alert = page.get_by_role("alert")
        alert.wait_for()
        assert alert.inner_text() == expected
        box = alert.bounding_box()
        assert 0 <= box["y"] < page.locator("#username").bounding_box()["y"]
        assert page.input_value("#username") == "supervisor.demo"
        assert page.evaluate("localStorage.getItem('gf_token')") is None
        if login != "network" and login[0] == 401:
            assert page.input_value("#password") == ""
            assert page.evaluate("document.activeElement.id") == "password"
        page.screenshot(path=str(tmp_path / "signin-error.png"))
        browser.close()


def test_touch_targets_and_footer_do_not_cover_the_form():
    with playwright.sync_playwright() as p:
        browser, page = open_login(p, api_responder((200, {})), height=600)
        page.get_by_text("Demo access").wait_for()
        for name in ["Sign in", "Show password", "Forgot password?", "Admin admin.demo"]:
            box = page.get_by_role("button", name=name).bounding_box()
            assert box["height"] >= 44 and box["width"] >= 44, name
        footer = page.locator("footer").bounding_box()
        demo = page.get_by_role("region", name="Demo access").bounding_box()
        assert footer["y"] >= demo["y"] + demo["height"]
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        page.get_by_role("button", name="Forgot password?").click()
        sheet = page.get_by_role("dialog", name="Forgot your password?")
        sheet.wait_for()
        close = sheet.get_by_role("button", name="Close").bounding_box()
        assert close["width"] >= 44 and close["height"] >= 44
        browser.close()


def test_demo_box_is_hidden_outside_demo_mode():
    with playwright.sync_playwright() as p:
        browser, page = open_login(p, api_responder((200, {}), demo_mode=False))
        page.wait_for_timeout(200)
        assert page.get_by_text("Demo access").count() == 0
        browser.close()
