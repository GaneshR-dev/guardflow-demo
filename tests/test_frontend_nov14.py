"""Browser coverage for the Nov 14 feature branch. Optional: pip install playwright; playwright install chromium."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

import pytest

playwright = pytest.importorskip("playwright.sync_api")
ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "attendance-app.html").read_text()
ASSETS = {
    "/app": ("text/html", HTML),
    "/attendance-app.css": ("text/css", (ROOT / "attendance-app.css").read_text()),
    "/attendance-app.js": ("text/javascript", (ROOT / "attendance-app.js").read_text()),
}


def fulfill_frontend(route):
    match = ASSETS.get(urlsplit(route.request.url).path)
    if not match:
        return False
    content_type, body = match
    route.fulfill(content_type=content_type, body=body)
    return True


def open_page(p, user, responder):
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.add_init_script(
        "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
        + json.dumps(user)
        + "))"
    )
    page.route("http://guardian.test/**", responder)
    page.goto("http://guardian.test/app")
    return browser, page


def test_checkout_asks_for_confirmation_with_time_and_hours(tmp_path):
    user = {"id": "supervisor.demo", "name": "Supervisor Demo", "role": "supervisor"}
    check_in = (datetime.now(timezone.utc) - timedelta(hours=2, minutes=5)).isoformat()
    row = {
        "employee_id": "EMP9001",
        "name": "Checkout Guard",
        "status": "checked_in",
        "check_in": check_in,
        "check_out": None,
    }
    posts = []

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        if path == "/api/attendance/checkout":
            posts.append(route.request.post_data_json)
        body = {
            "/api/locations": [{"id": "loc-test", "name": "Test Branch", "area": "Area", "assigned_count": 1}],
            "/api/attendance": {"rows": [row], "summary": {"checked_in": 1, "completed": 0, "not_in": 0}},
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser, page = open_page(p, user, respond)
        page.wait_for_selector("#attSearch")
        page.locator("[data-go=checkout]").click()
        page.wait_for_selector("[data-checkout]")
        # Cancel keeps the employee checked in and sends nothing.
        page.locator("[data-checkout]").first.click()
        page.wait_for_selector("#confirmOk")
        modal = page.locator(".modalCard").inner_text()
        assert "Are you sure you want to check out?" in modal
        assert "Checkout Guard (EMP9001)" in modal
        assert "Hours worked" in modal
        assert "2h 05m" in modal
        assert "IST" in modal
        page.locator("#confirmCancel").click()
        assert page.locator("#confirmOk").count() == 0
        assert posts == []
        # Confirm sends the checkout exactly once.
        page.locator("[data-checkout]").first.click()
        page.wait_for_selector("#confirmOk")
        page.screenshot(path=str(tmp_path / "checkout-confirm.png"))
        page.locator("#confirmOk").click()
        page.wait_for_function("document.body.innerText.includes('Check-out recorded')")
        assert posts == [{"employee_id": "EMP9001", "location_id": "loc-test"}]
        browser.close()


@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_location_detail_shows_shift_and_employees_to_both_roles(role, tmp_path):
    user = {"id": role + ".demo", "name": role.title() + " Demo", "role": role}
    location = {
        "id": "loc-test",
        "name": "Test Branch",
        "area": "Test Area",
        "assigned_count": 1,
        "shift_start": "09:00",
        "shift_end": "18:30",
    }
    employee = {"id": "EMP9001", "name": "Detail Guard", "role": "Guard", "location_id": "loc-test", "active": 1}

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        body = {
            "/api/locations": [location],
            "/api/attendance": {"rows": [], "summary": {}},
            "/api/employees": [employee],
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser, page = open_page(p, user, respond)
        page.wait_for_selector("#attSearch")
        page.evaluate("go('locations')")
        page.wait_for_selector("[data-loc]")
        page.locator("[data-loc]").first.click()
        page.wait_for_selector("[data-use-loc]")
        assert page.url.endswith("#locationDetail")
        page.wait_for_function("document.body.innerText.includes('Detail Guard')")
        text = page.inner_text("body")
        assert "09:00 am - 06:30 pm IST" in text
        assert "Detail Guard" in text
        # Removal controls stay admin-only; both roles see shift and employees.
        assert page.locator("[data-del-loc]").count() == (1 if role == "admin" else 0)
        assert page.locator("[data-del-emp]").count() == (1 if role == "admin" else 0)
        page.screenshot(path=str(tmp_path / (role + "-location-detail.png")))
        # "Mark attendance here" selects the branch and returns to attendance.
        page.locator("[data-use-loc]").click()
        page.wait_for_selector("#attSearch")
        assert page.evaluate("state.location.id") == "loc-test"
        browser.close()


def test_admin_edit_times_form_posts_ist_values(tmp_path):
    user = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
    row = {
        "employee_id": "EMP9001",
        "name": "Edit Guard",
        "status": "checked_in",
        "check_in": "2026-11-14T04:00:00+00:00",
        "check_out": None,
    }
    patches = []

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        if path == "/api/attendance/times":
            body = route.request.post_data_json
            patches.append(body)
            return route.fulfill(json=body)
        body = {
            "/api/locations": [{"id": "loc-test", "name": "Test Branch", "area": "Area", "assigned_count": 1}],
            "/api/attendance": {"rows": [row], "summary": {"checked_in": 1, "completed": 0, "not_in": 0}},
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser, page = open_page(p, user, respond)
        page.wait_for_selector("#attSearch")
        # Admin sees the edit control; the form is prefilled in IST (04:00 UTC -> 09:30 IST).
        page.locator("[data-edittime]").click()
        form = page.locator("#timeEditForm")
        assert form.locator("[name=check_in]").input_value() == "09:30"
        form.locator("[name=check_out]").fill("19:15")
        page.screenshot(path=str(tmp_path / "edit-times.png"))
        form.locator("button.secondary").click()
        page.wait_for_function("document.body.innerText.includes('Times updated')")
        assert patches[0]["check_in"] == "09:30"
        assert patches[0]["check_out"] == "19:15"
        assert patches[0]["employee_id"] == "EMP9001"
        browser.close()


def test_shift_button_and_optional_employee_location(tmp_path):
    user = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
    locations = [{"id": "loc-old", "name": "Old Branch", "area": "Old Area", "assigned_count": 0}]
    location_posts = []
    employee_posts = []

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        if path == "/api/settings/locations":
            location_posts.append(route.request.post_data_json)
            return route.fulfill(json=route.request.post_data_json)
        if path == "/api/employees" and route.request.method == "POST":
            body = route.request.post_data_json
            employee_posts.append(body)
            return route.fulfill(json={"id": "EMP9999", **body})
        body = {
            "/api/locations": locations,
            "/api/settings": {"profile": user, "locations": locations, "access": [user]},
            "/api/attendance": {"rows": [], "summary": {}},
            "/api/employees": [],
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser, page = open_page(p, user, respond)
        page.wait_for_selector("#attSearch")
        # Add location: shift inputs stay hidden until "Add shift" is clicked.
        page.evaluate("go('locations')")
        page.locator("[data-locaction=add]").click()
        form = page.locator("#locationForm")
        assert form.locator("#shiftFields").is_hidden()
        form.locator("#toggleShift").click()
        assert form.locator("#shiftFields").is_visible()
        form.locator("[name=name]").fill("Shift Branch")
        form.locator("[name=area]").fill("Shift Area")
        form.locator("[name=shift_start]").fill("08:00")
        form.locator("[name=shift_end]").fill("20:00")
        form.locator("[name=supervisor_id]").select_option("__unassigned__")
        page.screenshot(path=str(tmp_path / "add-shift.png"))
        form.locator("button.secondary").click()
        page.wait_for_function("document.body.innerText.includes('Location added as loc-shift-branch')")
        assert location_posts[0]["shift_start"] == "08:00"
        assert location_posts[0]["shift_end"] == "20:00"
        # Add employee: the location dropdown offers "Assign location later" and posts null.
        page.evaluate("go('employees')")
        page.wait_for_selector("[data-emp=add]")
        page.locator("[data-emp=add]").click()
        eform = page.locator("#employeeForm")
        assert "Assign location later" in eform.locator("[name=location_id]").inner_text()
        eform.locator("[name=name]").fill("Late Placement")
        eform.locator("[name=phone]").fill("+91 90000 00001")
        eform.locator("button.secondary").click()
        page.wait_for_function("document.body.innerText.includes('Employee added')")
        assert employee_posts[0]["location_id"] is None
        browser.close()
