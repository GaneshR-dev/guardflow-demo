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


def fulfill_frontend(route):
    match = ASSETS.get(urlsplit(route.request.url).path)
    if not match:
        return False
    content_type, body = match
    route.fulfill(content_type=content_type, body=body)
    return True


def open_employees(p, user):
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
        body = {
            "/api/locations": LOCATIONS,
            "/api/employees": EMPLOYEES,
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    page.route("http://guardian.test/**", respond)
    page.goto("http://guardian.test/app")
    page.locator("[data-go=menu]").click()
    page.locator("[data-go=employees]").click()
    page.wait_for_selector("#empLocFilter")
    return browser, page


def directory_names(page):
    return [
        t.strip()
        for t in page.locator("#directoryList .person strong").all_inner_texts()
    ]


def test_admin_location_filter_combines_with_search_and_resets(tmp_path):
    user = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
    with playwright.sync_playwright() as p:
        browser, page = open_employees(p, user)
        try:
            options = [
                o.strip()
                for o in page.locator("#empLocFilter option").all_inner_texts()
            ]
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
            options = [
                o.strip()
                for o in page.locator("#empLocFilter option").all_inner_texts()
            ]
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
