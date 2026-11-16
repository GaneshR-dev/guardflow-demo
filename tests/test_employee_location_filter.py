"""Browser coverage for the Employees screen location filter. Optional: pip install playwright; playwright install chromium."""

import json
from pathlib import Path
from urllib.parse import urlsplit

import pytest

playwright = pytest.importorskip("playwright.sync_api")
ROOT = Path(__file__).resolve().parents[1]
ASSETS = {
    "/app": ("text/html", (ROOT / "attendance-app.html").read_text()),
    "/attendance-app.css": ("text/css", (ROOT / "attendance-app.css").read_text()),
    "/attendance-app.js": ("text/javascript", (ROOT / "attendance-app.js").read_text()),
}

LOCATIONS = [
    {
        "id": "loc-north",
        "name": "North Site",
        "area": "Area",
        "assigned_count": 1,
        "active": 1,
    },
    {
        "id": "loc-south",
        "name": "South Site",
        "area": "Area",
        "assigned_count": 1,
        "active": 1,
    },
    {
        "id": "loc-old",
        "name": "Old Site",
        "area": "Area",
        "assigned_count": 0,
        "active": 0,
    },
]
EMPLOYEES = [
    {
        "id": "EMP001",
        "name": "Asha North",
        "role": "Guard",
        "phone": "9000000001",
        "location_id": "loc-north",
        "active": 1,
    },
    {
        "id": "EMP002",
        "name": "Bala South",
        "role": "Guard",
        "phone": "9000000002",
        "location_id": "loc-south",
        "active": 1,
    },
    {
        "id": "EMP003",
        "name": "Chitra Free",
        "role": "Guard",
        "phone": "9000000003",
        "location_id": None,
        "active": 1,
    },
]


ADMIN = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
SUPERVISOR = {"id": "supervisor.demo", "name": "Supervisor Demo", "role": "supervisor"}
LOGIN_USERS = [ADMIN, SUPERVISOR]


def fulfill_frontend(route):
    match = ASSETS.get(urlsplit(route.request.url).path)
    if not match:
        return False
    content_type, body = match
    route.fulfill(content_type=content_type, body=body)
    return True


def open_employees(p, user, locations=None, employees=None):
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.add_init_script(
        "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
        + json.dumps(user)
        + "))"
    )

    def respond(route):
        if fulfill_frontend(route):
            return
        path = urlsplit(route.request.url).path
        if path == "/api/login":
            # Sign-in hands back the identity matching the submitted user ID.
            creds = json.loads(route.request.post_data or "{}")
            login_user = next((u for u in LOGIN_USERS if u["id"] == creds.get("username")), None)
            if login_user:
                route.fulfill(
                    content_type="application/json",
                    body=json.dumps({"token": "token-" + login_user["id"], "user": login_user}),
                )
            else:
                route.fulfill(content_type="application/json", body="{}", status=401)
            return
        body = {
            "/api/locations": LOCATIONS if locations is None else locations,
            "/api/employees": EMPLOYEES if employees is None else employees,
            "/api/settings": {"profile": user, "locations": LOCATIONS, "access": []},
            "/api/dashboard": {"employees": 3, "checked_in": 0, "completed": 0, "not_checked_in": 3, "locations": []},
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    page.route("http://guardian.test/**", respond)
    page.goto("http://guardian.test/app")
    page.locator("[data-nav=employees]").click()
    page.wait_for_selector("#empLocFilter")
    return browser, page


def directory_names(page):
    return [t.strip() for t in page.locator("#directoryList .person strong").all_inner_texts()]


def test_admin_location_filter_combines_with_search_and_resets(tmp_path):
    user = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
    with playwright.sync_playwright() as p:
        browser, page = open_employees(p, user)
        try:
            options = [o.strip() for o in page.locator("#empLocFilter option").all_inner_texts()]
            # Alphabetical sites, disabled marked, unassigned last, admin only.
            assert options == [
                "All locations",
                "North Site",
                "Old Site (Disabled)",
                "South Site",
                "No location yet",
            ]
            assert directory_names(page) == ["Asha North", "Bala South", "Chitra Free"]

            page.locator("#empLocFilter").select_option("loc-north")
            assert directory_names(page) == ["Asha North"]

            # Search narrows further inside the chosen location (AND).
            page.locator("#empSearch").fill("EMP002")
            assert "No employees match." in page.locator("#directoryList").inner_text()
            page.locator("#empSearch").fill("")
            assert directory_names(page) == ["Asha North"]

            # Unplaced employees are reachable.
            page.locator("#empLocFilter").select_option("none")
            assert directory_names(page) == ["Chitra Free"]

            # Back to everything.
            page.locator("#empLocFilter").select_option("")
            assert directory_names(page) == ["Asha North", "Bala South", "Chitra Free"]
        finally:
            browser.close()


def test_supervisor_filter_hides_unassigned_option(tmp_path):
    user = {"id": "supervisor.demo", "name": "Supervisor Demo", "role": "supervisor"}
    with playwright.sync_playwright() as p:
        browser, page = open_employees(p, user)
        try:
            options = [o.strip() for o in page.locator("#empLocFilter option").all_inner_texts()]
            # The server scopes a supervisor's locations; "No location yet" is admin-only.
            assert options == [
                "All locations",
                "North Site",
                "Old Site (Disabled)",
                "South Site",
            ]
            page.locator("#empLocFilter").select_option("loc-south")
            assert directory_names(page) == ["Bala South"]
            # No Disable/Enable actions for supervisors.
            assert page.locator("#directoryList .outlineBtn").count() == 0
        finally:
            browser.close()


def test_supervisor_with_no_locations_gets_plain_all_option(tmp_path):
    user = {"id": "supervisor.demo", "name": "Supervisor Demo", "role": "supervisor"}
    with playwright.sync_playwright() as p:
        browser, page = open_employees(p, user, locations=[], employees=[])
        try:
            options = [o.strip() for o in page.locator("#empLocFilter option").all_inner_texts()]
            assert options == ["All locations"]
            assert "No employees match." in page.locator("#directoryList").inner_text()
        finally:
            browser.close()


def test_stale_location_pick_resets_to_all(tmp_path):
    user = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
    with playwright.sync_playwright() as p:
        browser, page = open_employees(p, user)
        try:
            page.locator("#empLocFilter").select_option("loc-north")
            assert directory_names(page) == ["Asha North"]
            # The site vanishes from the scoped list (access changed or site removed).
            page.evaluate("state.locations = state.locations.filter((l) => l.id !== 'loc-north'); render()")
            page.wait_for_timeout(300)
            assert page.locator("#empLocFilter").input_value() == ""
            assert directory_names(page) == ["Asha North", "Bala South", "Chitra Free"]
        finally:
            browser.close()


def test_filter_pick_resets_across_same_tab_sign_out(tmp_path):
    # Peer review repro: admin picks "No location yet", signs out, and a
    # supervisor signing in on the same tab must not inherit the pick.
    with playwright.sync_playwright() as p:
        browser, page = open_employees(p, ADMIN)
        try:
            page.locator("#empLocFilter").select_option("none")
            assert directory_names(page) == ["Chitra Free"]
            page.locator("[data-nav=settings]").click()
            page.locator("#logout").click()
            page.wait_for_selector("#loginForm")
            page.locator("#loginForm input[name=username]").fill("supervisor.demo")
            page.locator("#loginForm input[name=password]").fill("demo123")
            page.locator("#loginForm button.primary").click()
            page.locator("[data-nav=employees]").click()
            page.wait_for_selector("#empLocFilter")
            assert page.locator("#empLocFilter").input_value() == ""
            options = [o.strip() for o in page.locator("#empLocFilter option").all_inner_texts()]
            assert "No location yet" not in options
            assert directory_names(page) == ["Asha North", "Bala South", "Chitra Free"]
        finally:
            browser.close()


def test_unassigned_pick_is_invalid_for_non_admin(tmp_path):
    # Any path that leaves 'none' set for a non-admin resets to all instead of
    # hiding every placed employee behind a filter they cannot see.
    with playwright.sync_playwright() as p:
        browser, page = open_employees(p, SUPERVISOR)
        try:
            page.evaluate("state.employeeLocation = 'none'; render()")
            page.wait_for_timeout(300)
            assert page.locator("#empLocFilter").input_value() == ""
            assert directory_names(page) == ["Asha North", "Bala South", "Chitra Free"]
        finally:
            browser.close()
