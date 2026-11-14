"""Browser regression coverage. Optional: pip install playwright; playwright install chromium."""

import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

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
    """Serve the real frontend files to the in-browser tests. Returns True when handled."""
    match = ASSETS.get(urlsplit(route.request.url).path)
    if not match:
        return False
    content_type, body = match
    route.fulfill(content_type=content_type, body=body)
    return True


def serve_frontend_only(route):
    if not fulfill_frontend(route):
        route.abort()


@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_login_session_restore_and_location_navigation(role, tmp_path):
    user = {"id": role + ".demo", "name": role.title(), "role": role}
    locations = [
        {"id": "loc-test", "name": "Test Branch", "area": "Test Area", "assigned_count": 0},
        {"id": "loc-second", "name": "Second Branch", "area": "Other Area", "assigned_count": 0},
    ]
    if role == "admin":
        locations.append(
            {"id": "loc-admin-only", "name": "Admin Only Branch", "area": "Restricted Area", "assigned_count": 0}
        )
    attendance_calls = []
    checkin_calls = []

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        if path == "/api/attendance":
            attendance_calls.append(parse_qs(urlsplit(route.request.url).query)["location_id"][0])
        if path == "/api/attendance/checkin":
            checkin_calls.append(route.request.post_data_json)
        body = {
            "/api/login": {"token": "local-test-token", "user": user},
            "/api/locations": locations,
            "/api/attendance": {"rows": [], "summary": {}},
            "/api/attendance/checkin": {
                "name": "Test Employee",
                "employee_id": "EMPTEST",
                "check_in": "2026-11-13T12:00:00+00:00",
            },
            "/api/employees": [],
            "/api/logout": {},
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        page.route("http://guardian.test/**", respond)
        page.goto("http://guardian.test/app")
        page.locator("[name=username]").fill(user["id"])
        page.locator("[name=password]").fill("local-test-password")
        page.locator("#loginForm .primary").click()
        page.wait_for_selector("#attSearch")
        assert page.url.endswith("#attendance")
        assert page.locator("#attendanceLocation option").count() == (3 if role == "admin" else 2)
        with page.expect_response(lambda r: "/api/attendance?" in r.url and "location_id=loc-second" in r.url):
            page.locator("#attendanceLocation").select_option("loc-second")
        page.wait_for_function(
            "state.location.id==='loc-second' && document.querySelector('#attendanceLocation').value==='loc-second'"
        )
        assert attendance_calls[-1] == "loc-second"
        page.screenshot(path=str(tmp_path / (role + "-inline-location.png")))
        # Zero employees: chooser opens for chosen branch but cannot mark a record.
        page.locator("[data-go=add]").click()
        page.wait_for_selector("#addSearch")
        assert page.locator("[data-select]").count() == 0
        assert page.locator("#doCheckin").count() == 0
        assert page.locator("#toggleNew").count() == (1 if role == "admin" else 0)
        assert checkin_calls == []
        assert page.evaluate("state.location.id") == "loc-second"
        page.screenshot(path=str(tmp_path / (role + "-empty-branch-chooser.png")))
        page.locator("[data-go=attendance]").click()
        page.wait_for_selector("#attSearch")
        # Bare app restores attendance; deliberate Locations deep links remain valid.
        for url in ["http://guardian.test/app"]:
            page.goto(url)
            page.reload()
            page.wait_for_selector("#attSearch")
            assert page.url.endswith("#attendance")
        # Locations remains available by deliberate navigation during the session.
        page.locator(".menuButton").click()
        page.locator("[data-go=locations]").click()
        page.wait_for_selector("#locSearch")
        assert page.url.endswith("#locations")
        page.locator("#continueLoc").click()
        page.wait_for_selector("#attSearch")
        assert page.url.endswith("#attendance")
        page.goto("http://guardian.test/app#locations")
        page.reload()
        page.wait_for_selector("#locSearch")
        assert page.url.endswith("#locations")
        # With no scope, don't redirect a check-in attempt to an unusable picker.
        locations.clear()
        page.goto("http://guardian.test/app")
        page.reload()
        page.wait_for_function("document.body.innerText.includes('No location')")
        page.evaluate("go('add')")
        assert page.url.endswith("#attendance")
        assert page.locator("h1").inner_text() == "Mark attendance"
        if role == "supervisor":
            assert "No location access assigned" in page.inner_text("body")
            assert page.locator("[data-go=locations]").count() == 0
        context.close()
        browser.close()


def test_attendance_suppresses_superseded_success_and_error():
    """Control promise resolution order without timing guesses or backend writes."""
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page()
        page.route(re.compile(r"http://guardian\.test/(app|attendance-app\.)"), serve_frontend_only)
        page.goto("http://guardian.test/app")
        page.wait_for_selector("#loginForm")
        page.evaluate("""() => {
            window.pending=[];window.errors=[];
            api=(path)=>new Promise((resolve,reject)=>pending.push({path,resolve,reject}));
            state.token='session-1';state.user={role:'supervisor',id:'supervisor.demo'};
            state.screen='attendance';state.locations=[{id:'A',name:'A',area:''},{id:'B',name:'B',area:''}];
            window.start=(id,query='',filter='all')=>{state.location=state.locations.find(l=>l.id===id);state.query=query;state.filter=filter;return loadAttendance().catch(e=>errors.push(e.message));};
            window.finish=(i,label)=>pending[i].resolve({rows:[{name:label,employee_id:label,status:'not_in'}],summary:{not_in:1}});
        }""")
        # A old -> B -> A new, resolving newest first then oldest.
        page.evaluate("start('A');start('B');start('A');finish(2,'A-new')")
        page.wait_for_function("state.attendance[0]?.name==='A-new'")
        page.evaluate("finish(1,'B-old');finish(0,'A-old')")
        assert page.evaluate("state.attendance[0].name") == "A-new"
        # A -> B, old A cannot overwrite B.
        page.evaluate("start('A');start('B');finish(4,'B-new');finish(3,'A-older')")
        page.wait_for_function("state.attendance[0]?.name==='B-new'")
        # Same branch, query and filter races, including a superseded failure.
        page.evaluate(
            "start('B','old');start('B','new','not_in');finish(6,'query-new');pending[5].reject(new Error('stale query error'))"
        )
        page.wait_for_function("state.attendance[0]?.name==='query-new'")
        assert page.evaluate("errors") == []
        page.evaluate(
            "start('B','new','all');start('B','new','checked_in');finish(8,'filter-new');finish(7,'filter-old')"
        )
        page.wait_for_function("state.attendance[0]?.name==='filter-new'")
        # Changed session invalidates a response even for same branch/query/filter.
        page.evaluate("start('B');state.token='session-2';pending[9].reject(new Error('old session error'))")
        assert page.evaluate("errors") == []
        # Current failures still reach caller; they aren't silently swallowed.
        page.evaluate("start('B');pending[10].reject(new Error('current error'))")
        page.wait_for_function("errors.includes('current error')")
        assert page.evaluate("errors") == ["current error"]
        browser.close()


@pytest.mark.parametrize(
    "failure,expected",
    [
        ("credentials", "Wrong password or user ID. Try again."),
        ("throttle", "Too many failed sign-in attempts. Try again later."),
        ("server", "Service unavailable"),
        ("network", "Cannot reach the Guardian server. Check the connection and try again."),
    ],
)
def test_login_error_feedback(failure, expected, tmp_path):
    def respond(route):
        if fulfill_frontend(route):
            return
        if failure == "network":
            return route.abort()
        status, detail = {
            "credentials": (401, "Invalid user ID or password"),
            "throttle": (429, "Too many failed sign-in attempts. Try again later."),
            "server": (503, "Service unavailable"),
        }[failure]
        route.fulfill(status=status, content_type="application/json", body=json.dumps({"detail": detail}))

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.route("http://guardian.test/**", respond)
        page.goto("http://guardian.test/app")
        page.locator("[name=username]").fill("supervisor.demo")
        page.locator("[name=password]").fill("incorrect-local-test")
        page.locator("#loginForm .primary").click()
        page.wait_for_selector(".error")
        assert page.locator(".error").inner_text() == expected
        assert page.locator(".error").is_visible()
        box = page.locator(".error").bounding_box()
        assert box["y"] >= 0 and box["y"] + box["height"] < 844
        assert box["y"] < page.locator("[name=username]").bounding_box()["y"]
        assert page.locator("h1").inner_text() == "Guardian"
        assert page.evaluate("localStorage.getItem('gf_token')") is None
        page.screenshot(path=str(tmp_path / ("login-" + failure + ".png")))
        browser.close()


@pytest.mark.parametrize(
    "entry,selection",
    [
        ("locations", "supervisor.demo"),
        ("settings", "supervisor.demo"),
        ("locations", "__unassigned__"),
        ("settings", "__unassigned__"),
    ],
)
def test_location_creation_prompts_for_supervisor(entry, selection, tmp_path):
    user = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
    locations = [{"id": "loc-old", "name": "Existing Branch", "area": "Existing Area", "assigned_count": 0}]
    access = [
        user,
        {"id": "supervisor.demo", "name": "Supervisor Demo", "role": "supervisor", "location_ids": []},
        {"id": "other.supervisor", "name": "<Other Supervisor>", "role": "supervisor", "location_ids": []},
    ]
    posts = []

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        if path == "/api/settings/locations":
            body = route.request.post_data_json
            posts.append(body)
            locations.append({k: body[k] for k in ["id", "name", "area", "assigned_count"]})
            return route.fulfill(json=body)
        data = {
            "/api/locations": locations,
            "/api/settings": {"profile": user, "locations": locations, "access": access},
            "/api/attendance": {"rows": [], "summary": {}},
        }.get(path, {})
        route.fulfill(json=data)

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.add_init_script(
            "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
            + json.dumps(user)
            + "))"
        )
        page.route("http://guardian.test/**", respond)
        page.goto("http://guardian.test/app")
        page.wait_for_selector('h1:text("Mark attendance")')
        if entry == "locations":
            page.evaluate("go('locations')")
            page.locator("[data-locaction=add]").click()
        else:
            page.locator("[data-nav=settings]").click()
            page.locator("[data-settings=locations]").click()
        form = page.locator("#locationForm")
        form.locator("[name=name]").fill("New Branch")
        form.locator("[name=area]").fill("New Area")
        select = form.locator("[name=supervisor_id]")
        assert select.input_value() == ""
        assert select.locator("option").all_text_contents() == [
            "Choose a supervisor or leave unassigned",
            "Supervisor Demo (supervisor.demo)",
            "<Other Supervisor> (other.supervisor)",
            "Leave unassigned",
        ]
        assert select.locator("script").count() == 0
        # Missing choice blocks native form submission, not an automatic grant.
        form.locator("button").click()
        assert posts == []
        select.select_option(selection)
        assert page.locator("#locationSupervisorSelection").inner_text() == (
            "No supervisor will receive access."
            if selection == "__unassigned__"
            else "Supervisor Demo (supervisor.demo)"
        )
        form.scroll_into_view_if_needed()
        page.screenshot(path=str(tmp_path / (entry + "-assignment.png")))
        form.locator("button").click()
        page.wait_for_function("document.body.innerText.includes('Location added as loc-new-branch')")
        assert posts == [
            {
                "name": "New Branch",
                "area": "New Area",
                "supervisor_id": None if selection == "__unassigned__" else selection,
                "id": "loc-new-branch",
                "assigned_count": 0,
            }
        ]
        assert (
            "assigned to supervisor.demo" in page.inner_text("body")
            if selection == "supervisor.demo"
            else "(unassigned)" in page.inner_text("body")
        )
        browser.close()


@pytest.mark.parametrize("mode", ["empty", "unavailable"])
def test_location_supervisor_list_empty_or_unavailable(mode, tmp_path):
    user = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
    posts = []

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        if route.request.method == "POST":
            posts.append(path)
        if path == "/api/settings":
            if mode == "unavailable":
                return route.fulfill(status=503, json={"detail": "Service unavailable"})
            return route.fulfill(json={"profile": user, "locations": [], "access": [user]})
        return route.fulfill(json=[] if path == "/api/locations" else {})

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.add_init_script(
            "localStorage.setItem('gf_token','local-test-token');localStorage.setItem('gf_user',JSON.stringify("
            + json.dumps(user)
            + "))"
        )
        page.route("http://guardian.test/**", respond)
        page.goto("http://guardian.test/app#locations")
        if mode == "empty":
            page.wait_for_selector("#locationSupervisor")
            assert "No supervisor accounts yet." in page.inner_text("body")
            assert page.locator("#locationSupervisor option").count() == 2
            assert page.locator("#locationSupervisor").input_value() == ""
        else:
            page.wait_for_selector(".error")
            assert "Service unavailable" in page.locator(".error").inner_text()
            assert page.locator("#locationSupervisor").is_disabled()
            assert page.locator("#locationForm button").is_disabled()
        page.locator("#locationForm").scroll_into_view_if_needed()
        page.screenshot(path=str(tmp_path / (mode + "-assignment.png")))
        assert posts == []
        browser.close()


def test_excel_report_download_keeps_selected_filters(tmp_path):
    calls = []

    def respond(route):
        parsed = urlsplit(route.request.url)
        path = parsed.path
        if fulfill_frontend(route):
            return
        if path == "/api/reports/export.xlsx":
            calls.append((parse_qs(parsed.query), route.request.headers.get("authorization")))
            return route.fulfill(
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                body=b"illustrative-download-fixture",
            )
        body = {
            "/api/login": {"token": "test-token", "user": {"id": "test", "name": "Test", "role": "supervisor"}},
            "/api/locations": [{"id": "loc-test", "name": "Test Site", "area": "Test Area", "assigned_count": 0}],
            "/api/attendance": {"rows": [], "summary": {}},
            "/api/reports/months": [{"month": "2026-11", "total_records": 1, "completed": 1}],
            "/api/reports/summary": {
                "month": "2026-11",
                "totals": {"records": 1, "completed": 1, "checked_in": 0, "not_in": 0, "avg_hours": 10},
                "locations": [],
                "days": [],
            },
            "/api/reports/monthly": {
                "rows": [
                    {
                        "day": "2026-11-10",
                        "employee_name": "Sample Guard",
                        "employee_id": "SAMPLE",
                        "location_name": "Test Site",
                        "status": "completed",
                        "check_in": "2026-11-10T02:30:00Z",
                        "check_out": "2026-11-10T12:30:00Z",
                        "hours": 10,
                    }
                ]
            },
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.route("http://guardian.test/**", respond)
        page.goto("http://guardian.test/app")
        page.locator("[name=username]").fill("test")
        page.locator("[name=password]").fill("fixture-password")
        page.locator("#loginForm .primary").click()
        page.wait_for_selector("#attSearch")
        page.locator("[data-nav=reports]").click()
        page.wait_for_selector(".rpStats")
        # The date picker is a hidden native input behind the date button.
        page.evaluate(
            "() => { const i = document.getElementById('reportPeriod'); i.value = '2026-11-10';"
            " i.dispatchEvent(new Event('change')); }"
        )
        page.wait_for_function("state.report.date==='2026-11-10' && !state.report.loading")
        page.screenshot(path=str(tmp_path / "excel-report-phone.png"), full_page=True)
        with page.expect_download() as pending:
            page.locator("#reportExport").click()
        assert pending.value.suggested_filename == "guardian-attendance-2026-11-10.xlsx"
        assert calls[-1] == (
            {"month": ["2026-11"], "day": ["2026-11-10"], "location_id": ["loc-test"]},
            "Bearer test-token",
        )
        # The status figures filter the list without a new request.
        page.locator("[data-rstatus=completed]").click()
        assert page.locator(".rpRow").count() == 1
        # A month-history export must not accidentally inherit the daily filter.
        page.locator("[data-rtab=history]").click()
        page.wait_for_selector('[data-export="2026-11"]')
        with page.expect_download():
            page.locator('[data-export="2026-11"]').click()
        assert calls[-1][0] == {"month": ["2026-11"]}
        assert not page.locator(".error").count()
        browser.close()
