"""Browser tests for the React Attendance screen at /next/attendance.

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
SITES = [
    {"id": "loc-hsr", "name": "Bengaluru - HSR Layout", "area": "A", "assigned_count": 3, "active": 1},
    {"id": "loc-wf", "name": "Bengaluru - Whitefield", "area": "B", "assigned_count": 2, "active": 1},
]


def row(employee_id, name, status):
    return {
        "id": None if status == "not_in" else "r-" + employee_id,
        "employee_id": employee_id,
        "name": name,
        "location_id": "loc-hsr",
        "status": status,
        "check_in": None if status == "not_in" else "2026-11-17T03:34:00Z",
        "check_out": "2026-11-17T12:32:00Z" if status == "completed" else None,
    }


ATTENDANCE = {
    "day": "2026-11-17",
    "summary": {"checked_in": 1, "completed": 1, "not_in": 1},
    "rows": [
        row("EMP1001", "Anil Kumar Sharma Venkataraman", "not_in"),
        row("EMP1002", "Meena P", "checked_in"),
        row("EMP1003", "Suresh K", "completed"),
    ],
    "stale_open": [],
}


def open_attendance(p, calls, attendance=ATTENDANCE):
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
        request = route.request
        path = urlsplit(request.url).path
        calls.append((request.method, path, request.post_data))
        body = {
            "/api/locations": SITES,
            "/api/attendance": attendance,
            "/api/attendance/checkin": {"employee_id": "EMP1001", "name": "Anil Kumar Sharma Venkataraman"},
        }.get(path)
        if body is None:
            return route.fulfill(status=404, content_type="application/json", body='{"detail":"Not found"}')
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

    page.route("http://guardian.test/**", respond)
    page.goto("http://guardian.test/next/attendance?location=loc-hsr")
    page.get_by_role("region", name="Guards at this site").wait_for()
    return browser, page


def test_attendance_layout_at_phone_width(tmp_path):
    with playwright.sync_playwright() as p:
        browser, page = open_attendance(p, [])
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        buttons = page.locator("main button").all()
        assert len(buttons) >= 8
        for button in buttons:
            box = button.bounding_box()
            if box:
                assert box["height"] >= 44, button.inner_text()
                assert box["x"] >= 0 and box["x"] + box["width"] <= 390
        # All four filters show without a sideways scroll.
        for name in ["All", "Not checked in", "Checked in", "Checked out"]:
            box = page.get_by_role("button", name=name, exact=False).first.bounding_box()
            assert box["x"] + box["width"] <= 390
        # A long name wraps and is not cut.
        name = page.get_by_text("Anil Kumar Sharma Venkataraman")
        assert name.evaluate("e => e.scrollWidth <= e.clientWidth")
        page.screenshot(path=str(tmp_path / "attendance.png"), full_page=True)
        browser.close()


def test_check_in_flow_sends_one_request():
    calls = []
    with playwright.sync_playwright() as p:
        browser, page = open_attendance(p, calls)
        page.get_by_role("button", name="Check in Anil Kumar Sharma Venkataraman").click()
        dialog = page.get_by_role("alertdialog", name="Confirm check-in")
        dialog.wait_for()
        dialog.get_by_role("button", name="Check in").dblclick()
        page.get_by_text("Check-in recorded · Anil Kumar Sharma Venkataraman").wait_for()
        posts = [c for c in calls if c[0] == "POST" and c[1] == "/api/attendance/checkin"]
        assert len(posts) == 1
        assert json.loads(posts[0][2]) == {
            "employee_id": "EMP1001",
            "location_id": "loc-hsr",
            "confirm_second_shift": False,
        }
        browser.close()


def test_cards_have_gaps_and_equal_action_buttons():
    with playwright.sync_playwright() as p:
        browser, page = open_attendance(p, [])
        cards = page.get_by_role("region", name="Guards at this site").get_by_role("listitem").all()
        boxes = [c.bounding_box() for c in cards]
        assert boxes[1]["y"] - (boxes[0]["y"] + boxes[0]["height"]) >= 8
        widths = {
            round(page.get_by_role("button", name=n).bounding_box()["width"])
            for n in ["Check in Anil Kumar Sharma Venkataraman", "Check out Meena P", "Check in Suresh K"]
        }
        assert len(widths) == 1
        # The edit button is at the top right of the card.
        card = cards[1].bounding_box()
        edit = page.get_by_role("button", name="Edit times for Meena P").bounding_box()
        assert edit["y"] < card["y"] + 24
        assert edit["x"] + edit["width"] > card["x"] + card["width"] - 24
        browser.close()


def test_search_and_filters_stay_at_the_top_of_a_long_list():
    many = dict(ATTENDANCE)
    many["rows"] = [row(f"EMP{2000 + i}", f"Guard {i:02d}", "not_in") for i in range(60)]
    many["summary"] = {"checked_in": 0, "completed": 0, "not_in": 60}
    with playwright.sync_playwright() as p:
        browser, page = open_attendance(p, [], attendance=many)
        page.mouse.wheel(0, 3000)
        page.wait_for_timeout(300)
        search = page.get_by_role("searchbox").bounding_box()
        assert 0 <= search["y"] < 40
        compact = page.locator(".sticky").get_by_role("group", name="Filter by status")
        compact.wait_for()
        for button in compact.get_by_role("button").all():
            box = button.bounding_box()
            assert box["height"] >= 44 and box["x"] + box["width"] <= 390
        compact.get_by_role("button", name="0 Checked in").click()
        page.wait_for_url("**status=checked_in**")
        browser.close()
