"""Browser coverage: location split on the overview (both roles' Home) and the per-user access screen."""

import json
from urllib.parse import urlsplit

import pytest

playwright = pytest.importorskip("playwright.sync_api")
from test_frontend_nov16 import fulfill_frontend  # noqa: E402

LOCS = [
    {"id": "A", "name": "Co - Site A", "area": "N", "assigned_count": 3, "disabled_count": 0, "active": 1,
     "today": {"checked_in": 2, "completed": 1, "not_in": 0}},
    {"id": "B", "name": "Co - Site B", "area": "S", "assigned_count": 2, "disabled_count": 0, "active": 1,
     "today": {"checked_in": 0, "completed": 1, "not_in": 1}},
]  # fmt: skip
DASH = {"employees": 5, "checked_in": 2, "completed": 2, "not_checked_in": 1, "locations": LOCS}


def open_as(p, user, extra=None):
    state = {"saved": None}

    def respond(route):
        path = urlsplit(route.request.url).path
        if fulfill_frontend(route):
            return
        if path == "/api/settings/access/sup.one/locations":
            state["saved"] = route.request.post_data_json
            return route.fulfill(json={"unsupervised": []})
        body = {
            "/api/dashboard": DASH,
            "/api/locations": [dict(loc, area="x") for loc in LOCS],
            "/api/settings": {
                "profile": user,
                "locations": LOCS,
                "access": [
                    {"id": "admin.demo", "name": "Admin Demo", "role": "admin", "active": 1, "location_ids": []},
                    {"id": "sup.one", "name": "Sup One", "role": "supervisor", "active": 1, "location_ids": ["A"]},
                ],
            },
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.add_init_script(
        "localStorage.setItem('gf_token','t');localStorage.setItem('gf_user',JSON.stringify(" + json.dumps(user) + "))"
    )
    page.route("http://guardian.test/**", respond)
    page.goto("http://guardian.test/app")
    return browser, page, state


@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_home_overview_has_all_and_each_location(role):
    user = {"id": role + ".x", "name": "U", "role": role}
    with playwright.sync_playwright() as p:
        browser, page, _ = open_as(p, user)
        page.wait_for_selector("h1:text('Attendance overview')")
        options = page.locator("#overviewLocation option").all_text_contents()
        assert options == ["All locations", "Site A", "Site B"]
        assert page.locator("[data-overview-loc]").count() == 2  # location cards only
        assert page.locator(".dashStat strong").all_text_contents() == ["5", "2", "2", "1"]
        page.locator("#overviewLocation").select_option("B")
        assert page.locator(".dashStat strong").all_text_contents() == ["2", "0", "1", "1"]
        assert page.locator(".locCard").count() == 1
        page.locator("#overviewLocation").select_option("")
        assert page.locator(".locCard").count() == 2
        assert "1 not checked in" in page.locator(".locCard").nth(1).inner_text()
        browser.close()


def test_user_access_rows_open_a_detail_screen_to_add_locations():
    user = {"id": "admin.demo", "name": "Admin Demo", "role": "admin"}
    with playwright.sync_playwright() as p:
        browser, page, state = open_as(p, user)
        page.wait_for_selector("h1:text('Attendance overview')")
        page.locator("[data-nav=settings]").click()
        page.locator("[data-settings=access]").click()
        page.wait_for_selector("[data-open-access='sup.one']")
        assert not page.locator("#accessForm").is_visible()  # add-supervisor form is collapsed
        page.locator("[data-open-access='sup.one']").click()
        page.wait_for_selector("#accessEditForm")
        assert page.locator("h1").inner_text() == "Sup One"
        boxes = page.locator("#accessEditForm input[type=checkbox]")
        assert [boxes.nth(i).is_checked() for i in range(2)] == [True, False]
        boxes.nth(1).check()
        page.locator("#accessEditForm button").click()
        page.wait_for_function("document.body.innerText.includes('Locations updated')")
        assert sorted(state["saved"]["location_ids"]) == ["A", "B"]
        page.locator("[data-settings=access]").first.click()
        page.wait_for_selector("[data-open-access='admin.demo']")
        page.locator("[data-open-access='admin.demo']").click()
        page.wait_for_selector("text=Admins can work at all locations")
        assert page.locator("#accessEditForm").count() == 0
        browser.close()


def test_supervisor_cannot_open_user_detail():
    user = {"id": "sup.one", "name": "Sup One", "role": "supervisor"}
    with playwright.sync_playwright() as p:
        browser, page, _ = open_as(p, user)
        page.wait_for_selector("h1:text('Attendance overview')")
        page.locator("[data-nav=settings]").click()
        page.locator("[data-settings=access]").click()
        page.wait_for_selector(".accessCard")
        assert page.locator("[data-open-access]").count() == 0
        browser.close()
