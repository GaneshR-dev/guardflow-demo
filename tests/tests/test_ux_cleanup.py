"""UX regression checks use real frontend bytes with fictional responses, no live writes."""

import json
from urllib.parse import urlsplit

import pytest
from test_frontend_nov14 import fulfill_frontend, open_page, playwright

LOCATION = {
    "id": "loc-test",
    "name": "ABC",
    "area": "Chennai",
    "active": 1,
    "assigned_count": 3,
    "shifts": [{"shift_start": "20:00", "shift_end": "04:00", "label": "Night"}],
}
ROWS = [
    {"employee_id": "EMP1001", "name": "Arun Kumar", "status": "checked_in", "check_in": "2026-11-14T02:30:00Z"},
    {
        "employee_id": "EMP1002",
        "name": "Meera Sundaram",
        "status": "completed",
        "check_in": "2026-11-14T02:30:00Z",
        "check_out": "2026-11-14T14:30:00Z",
    },
    {"employee_id": "EMP1003", "name": "Ravi Chandran", "status": "not_in"},
]
USER = {"id": "ux-admin", "name": "Review Admin", "role": "admin"}


def responder(route):
    if fulfill_frontend(route):
        return
    path = urlsplit(route.request.url).path
    user = USER
    body = {
        "/api/locations": [LOCATION],
        "/api/attendance": {"rows": ROWS, "summary": {"checked_in": 1, "completed": 1, "not_in": 1}},
        "/api/employees": [
            {"id": r["employee_id"], "name": r["name"], "role": "Guard", "active": 1, "location_id": "loc-test"}
            for r in ROWS
        ],
        "/api/employee-lookup": {"matches": []},
        "/api/settings": {"profile": user, "locations": [LOCATION], "access": [user]},
        "/api/dashboard": {"employees": 3, "checked_in": 1, "completed": 1, "not_checked_in": 1, "locations": []},
    }.get(path, {})
    route.fulfill(json=body)


@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_role_controls_and_location_context(role):
    with playwright.sync_playwright() as p:
        browser, page = open_page(p, {**USER, "role": role}, responder)
        page.wait_for_selector("#attSearch")
        assert page.locator(".hero").count() == 0
        assert page.locator(".recordingAt").inner_text().endswith("ABC · Chennai")
        assert page.locator("[data-edittime]").count() == (2 if role == "admin" else 0)
        page.evaluate("openLocationDetail('loc-test')")
        page.wait_for_selector(".shiftSummary")
        assert "Ends the next day" in page.inner_text("body")
        assert page.locator("#toggleShiftEdit").count() == (1 if role == "admin" else 0)
        assert page.locator(".locationSettings").count() == (1 if role == "admin" else 0)
        if role == "admin":
            assert not page.locator("[data-del-loc]").is_visible()
            page.locator(".locationSettings summary").click()
            assert page.locator("[data-del-loc]").is_visible()
        page.evaluate("go('checkout')")
        page.wait_for_selector("#outSearch")
        assert "ABC" in page.inner_text("body")
        page.evaluate(
            "state.lastCheck = {name:'Arun',employee_id:'EMP1001',check_in:'2026-11-14T02:30:00Z'};go('confirmed')"
        )
        page.wait_for_selector(".confirmCard")
        assert "ABC" in page.locator(".confirmCard").inner_text()
        browser.close()


@pytest.mark.parametrize(
    "screen,selector",
    [
        ("locations", "#locSearch"),
        ("employees", "#empSearch"),
        ("attendance", "#attSearch"),
        ("add", "#addSearch"),
        ("checkout", "#outSearch"),
    ],
)
def test_search_keeps_native_input_for_repeat_word_delete_and_composition(screen, selector):
    with playwright.sync_playwright() as p:
        browser, page = open_page(p, USER, responder)
        page.wait_for_selector("#attSearch")
        page.evaluate("go(" + json.dumps(screen) + ")")
        page.wait_for_selector(selector)
        field = page.locator(selector)
        field.fill("alpha beta gamma")
        field.focus()
        page.evaluate(
            "window.typedNode = document.activeElement; typedNode.setSelectionRange(typedNode.value.length,typedNode.value.length)"
        )
        page.keyboard.press("Control+Backspace")
        assert field.input_value() == "alpha beta "
        # Repeated native keydown events, with results refreshed between events.
        for _ in range(5):
            page.keyboard.down("Backspace")
            page.evaluate("render()")
        page.keyboard.up("Backspace")
        assert field.input_value() == "alpha "
        assert page.evaluate("document.activeElement === window.typedNode && typedNode.isConnected")
        # Composition target must stay mounted through an asynchronous result repaint.
        page.evaluate("typedNode.dispatchEvent(new CompositionEvent('compositionstart', {data:'a'}));render()")
        assert page.evaluate("document.activeElement === typedNode")
        page.keyboard.press("Control+A")
        page.keyboard.press("Backspace")
        assert field.input_value() == ""
        browser.close()


def test_shift_draft_retry_limit_labels_and_double_submit():
    calls = []
    fail = True

    def respond(route):
        if urlsplit(route.request.url).path.endswith("/shifts"):
            calls.append(route.request.post_data_json)
            return route.fulfill(status=503 if fail else 200, json={"detail": "Please try again"})
        responder(route)

    with playwright.sync_playwright() as p:
        browser, page = open_page(p, USER, respond)
        page.wait_for_selector("#attSearch")
        page.evaluate("openLocationDetail('loc-test')")
        page.locator("#toggleShiftEdit").click()
        assert page.locator(".shiftSummary").count() == 0
        form = page.locator("#shiftEditForm")
        form.locator("[name=shift_start]").fill("21:15")
        form.locator("button.primary").click()
        page.wait_for_selector(".inlineError")
        assert form.locator("[name=shift_start]").input_value() == "21:15"
        assert len(calls) == 1
        assert calls[0]["shifts"][0]["label"] == "Night"
        for _ in range(4):
            page.locator("#addShiftRow").click()
        assert page.locator("[data-shift-row]").count() == 5
        assert not page.locator("#addShiftRow").is_visible()
        page.locator(".shiftRemove").last.click()
        assert page.locator("#shiftCount").inner_text() == "4/5"
        # Cancel restores persisted values, not the failed draft.
        page.locator("#cancelShiftEdit").click()
        assert "08:00 pm" in page.locator(".shiftSummary").inner_text()
        page.locator("#toggleShiftEdit").click()
        fail = False
        # Two immediate submits can produce only one request.
        page.evaluate(
            "const f=document.querySelector('#shiftEditForm'); f.dispatchEvent(new Event('submit',{cancelable:true}));saveShifts({preventDefault(){},target:f})"
        )
        page.wait_for_selector("#toggleShiftEdit")
        assert len(calls) == 2
        assert page.locator(".inlineError").count() == 0
        browser.close()


@pytest.mark.parametrize("width", [320, 390, 1280])
def test_mobile_layout_and_target_sizes(width):
    with playwright.sync_playwright() as p:
        browser, page = open_page(p, USER, responder)
        page.set_viewport_size({"width": width, "height": 844})
        page.wait_for_selector("#attSearch")
        for screen in ["attendance", "add", "checkout", "locations", "employees", "settings", "menu"]:
            page.evaluate("go(" + json.dumps(screen) + ")")
            page.wait_for_function("document.querySelector('.page,.navPanel') !== null")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), screen
            sizes = page.locator("button:visible").evaluate_all(
                "els => els.map(e=>({text:e.innerText,h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width}))"
            )
            assert all(x["h"] >= 44 and x["w"] >= 44 for x in sizes), (screen, sizes)
        page.evaluate("openLocationDetail('loc-test')")
        page.locator("#toggleShiftEdit").click()
        boxes = page.locator(".shiftTimes input").evaluate_all("els=>els.map(e=>e.getBoundingClientRect().y)")
        assert boxes[0] == boxes[1]
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        browser.close()
