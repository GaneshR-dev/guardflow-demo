"""Browser coverage for account switching in one tab. Optional: pip install playwright.

Signing out must drop every per-account object, and a reply that arrives after the
session changed must be ignored, so a second login never sees the first login's data.
"""

import json
from urllib.parse import urlsplit

import pytest

playwright = pytest.importorskip("playwright.sync_api")
from test_frontend_nov16 import LOCATIONS, fulfill_frontend, open_page  # noqa: E402


def test_logout_clears_account_state_and_drops_late_replies():
    release = {}

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        if path == "/api/employees" and "hold" in release:
            release["route"] = route  # reply held until after sign-out
            return
        body = {
            "/api/locations": LOCATIONS,
            "/api/attendance": {"rows": [], "summary": {}, "stale_open": []},
            "/api/logout": {"ok": True},
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser, page = open_page(p, respond)
        page.wait_for_selector("#attSearch")
        page.evaluate(
            "state.settings={profile:{name:'Supervisor Demo'},access:[1]};state.employees=[{id:'EMP1'}];"
            "state.employeeQuery='abc';state.detail={x:1};state.settingsView='profile';state.audit=[1]"
        )
        release["hold"] = True
        page.evaluate("void (window.__late = api('/api/employees').then(r => { state.employees = r; }))")
        page.wait_for_timeout(200)
        page.evaluate("logout()")
        page.wait_for_selector("form")
        snap = page.evaluate(
            "({token: state.token, user: state.user, settings: state.settings, employees: state.employees,"
            " q: state.employeeQuery, detail: state.detail, view: state.settingsView, audit: state.audit,"
            " screen: state.screen})"
        )
        assert snap == {
            "token": "", "user": None, "settings": None, "employees": [], "q": "",
            "detail": None, "view": "", "audit": None, "screen": "login",
        }  # fmt: skip
        release["route"].fulfill(content_type="application/json", body=json.dumps([{"id": "OLD"}]))
        page.wait_for_timeout(300)
        assert page.evaluate("state.employees") == []
        browser.close()
