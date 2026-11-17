"""Phone-size regression coverage. All preview data is fictional."""

import os
from pathlib import Path

import pytest
from test_frontend_landing import fulfill_frontend

playwright = pytest.importorskip("playwright.sync_api")

PREVIEW = Path(os.environ.get("GUARDIAN_PREVIEW_DIR", "/tmp/guardian-review-preview"))


def test_day_counts_entries_and_unique_people_and_audit_names():
    PREVIEW.mkdir(exist_ok=True)
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.route("http://guardian.test/**", lambda route: fulfill_frontend(route) or route.fulfill(json={}))
        page.goto("http://guardian.test/app")
        page.wait_for_selector("#loginForm")
        page.evaluate("""() => {
            state.user={id:'admin.demo',name:'Admin Demo',role:'admin'};
            state.token='local-preview-only';state.screen='reports';
            state.locations=[{id:'sample-site',name:'Sample Gate',area:'Test Area',active:1}];
            state.report={tab:'day',dayLocation:'sample-site',date:todayISO(),status:'all',loading:false,
                day:{rows:Array.from({length:7},(_,i)=>({employee_id:'EMP'+(i%3),
                employee_name:['Sample Guard A','Sample Guard B','Sample Guard C'][i%3],
                status:i<3?'checked_in':'completed',check_in:todayISO()+'T03:00:00Z',
                check_out:i<3?null:todayISO()+'T11:00:00Z',hours:i<3?null:8}))}};
            render();
        }""")
        assert page.locator(".rpListHead strong").inner_text() == "3 guards · 7 entries"
        assert page.locator(".rpRow").count() == 7
        assert "7 All entries" in page.locator("[data-rstatus=all]").inner_text().replace("\n", " ")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(PREVIEW / "report-preview.png"))
        page.locator("[data-rstatus=completed]").click()
        assert page.locator(".rpListHead strong").inner_text() == "4 entries · checked out"
        assert page.locator(".rpRow").count() == 4
        page.evaluate("""() => {
            state.screen='settings';state.settingsView='activity';
            state.settings={profile:state.user,locations:state.locations,access:[]};
            state.audit=[
              {action:'attendance.checkin',user_id:'supervisor.demo',at:todayISO()+'T03:00:00Z',
               details:{employee_id:'EMP0',location_id:'sample-site'},
               labels:{employee_name:'Sample Guard A',location_name:'Sample Gate'}},
              {action:'employee.transfer',user_id:'admin.demo',at:todayISO()+'T02:00:00Z',
               details:{employee_id:'EMP0',from:'old-site',to:'sample-site'},
               labels:{employee_name:'Sample Guard A',from_name:'Old Gate',to_name:'Sample Gate'}},
              {action:'attendance.times.edit',user_id:'admin.demo',at:todayISO()+'T01:00:00Z',
               details:{employee_id:'EMP0',day:todayISO(),reason:'Correct missed check-out'},
               labels:{employee_name:'Sample Guard A'}}];render();
        }""")
        assert "Sample Guard A · Sample Gate" in page.inner_text("body")
        assert "Old Gate to Sample Gate" in page.inner_text("body")
        assert "Reason: Correct missed check-out" in page.inner_text("body")
        assert "EMP0" not in page.inner_text("body")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(PREVIEW / "activity-preview.png"))
        assert (
            page.evaluate(
                "auditDetail({action:'attendance.checkin',details:{employee_id:'MISSING',location_id:'unknown-site'}})"
            )
            == "MISSING · unknown-site"
        )
        # Dynamic names remain plain text after the existing esc() boundary.
        page.evaluate("state.audit[0].labels.employee_name='<img src=x onerror=alert(1)>';render()")
        assert page.locator(".person img").count() == 0
        page.evaluate("""() => {state.screen='reports';state.report.status='all';
            state.report.day.rows=[{employee_id:'ONE',employee_name:'One Guard',status:'not_in'}];render();}""")
        assert page.locator(".rpListHead strong").inner_text() == "1 guard · 1 entry"
        assert page.locator(".rpRow").count() == 1
        browser.close()
