"""Browser regression coverage. Optional: pip install playwright; playwright install chromium."""
import json
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

import pytest

playwright = pytest.importorskip('playwright.sync_api')
HTML = (Path(__file__).resolve().parents[1] / 'attendance-app.html').read_text()


@pytest.mark.parametrize('role', ['admin', 'supervisor'])
def test_login_session_restore_and_location_navigation(role, tmp_path):
    user = {'id': role + '.demo', 'name': role.title(), 'role': role}
    locations = [{'id': 'loc-test', 'name': 'Test Branch', 'area': 'Test Area', 'assigned_count': 0},
                 {'id': 'loc-second', 'name': 'Second Branch', 'area': 'Other Area', 'assigned_count': 0}]
    if role == 'admin':
        locations.append({'id': 'loc-admin-only', 'name': 'Admin Only Branch', 'area': 'Restricted Area', 'assigned_count': 0})
    attendance_calls = []
    checkin_calls = []

    def respond(route):
        path = urlsplit(route.request.url).path
        if path == '/app':
            return route.fulfill(content_type='text/html', body=HTML)
        if path == '/api/attendance':
            attendance_calls.append(parse_qs(urlsplit(route.request.url).query)['location_id'][0])
        if path == '/api/attendance/checkin':
            checkin_calls.append(route.request.post_data_json)
        body = {
            '/api/login': {'token': 'local-test-token', 'user': user},
            '/api/locations': locations,
            '/api/attendance': {'rows': [], 'summary': {}},
            '/api/attendance/checkin': {'name': 'Test Employee', 'employee_id': 'EMPTEST', 'check_in': '2026-11-13T12:00:00+00:00'},
            '/api/employees': [],
            '/api/logout': {},
        }.get(path, {})
        route.fulfill(content_type='application/json', body=json.dumps(body))

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        page.route('http://guardian.test/**', respond)
        page.goto('http://guardian.test/app')
        page.locator('[name=username]').fill(user['id'])
        page.locator('[name=password]').fill('local-test-password')
        page.locator('#loginForm .primary').click()
        page.wait_for_selector('#attSearch')
        assert page.url.endswith('#attendance')
        assert page.locator('#attendanceLocation option').count() == (3 if role == 'admin' else 2)
        with page.expect_response(lambda r: '/api/attendance?' in r.url and 'location_id=loc-second' in r.url):
            page.locator('#attendanceLocation').select_option('loc-second')
        page.wait_for_function("state.location.id==='loc-second' && document.querySelector('#attendanceLocation').value==='loc-second'")
        assert attendance_calls[-1] == 'loc-second'
        page.screenshot(path=str(tmp_path / (role + '-inline-location.png')))
        # Zero employees: chooser opens for chosen branch but cannot mark a record.
        page.locator('[data-go=add]').click();page.wait_for_selector('#addSearch')
        assert page.locator('[data-select]').count() == 0
        assert page.locator('#doCheckin').count() == 0
        assert page.locator('#toggleNew').count() == (1 if role == 'admin' else 0)
        assert checkin_calls == []
        assert page.evaluate('state.location.id') == 'loc-second'
        page.screenshot(path=str(tmp_path / (role + '-empty-branch-chooser.png')))
        page.locator('[data-go=attendance]').click();page.wait_for_selector('#attSearch')
        # Bare app restores attendance; deliberate Locations deep links remain valid.
        for url in ['http://guardian.test/app']:
            page.goto(url)
            page.reload()
            page.wait_for_selector('#attSearch')
            assert page.url.endswith('#attendance')
        # Locations remains available by deliberate navigation during the session.
        page.locator('.menuButton').click()
        page.locator('[data-go=locations]').click()
        page.wait_for_selector('#locSearch')
        assert page.url.endswith('#locations')
        page.locator('#continueLoc').click()
        page.wait_for_selector('#attSearch')
        assert page.url.endswith('#attendance')
        page.goto('http://guardian.test/app#locations')
        page.reload();page.wait_for_selector('#locSearch')
        assert page.url.endswith('#locations')
        # With no scope, don't redirect a check-in attempt to an unusable picker.
        locations.clear()
        page.goto('http://guardian.test/app')
        page.reload()
        page.wait_for_function("document.body.innerText.includes('No location')")
        page.evaluate("go('add')")
        assert page.url.endswith('#attendance')
        assert page.locator('h1').inner_text() == 'Mark attendance'
        if role == 'supervisor':
            assert 'No location access assigned' in page.inner_text('body')
            assert page.locator('[data-go=locations]').count() == 0
        context.close()
        browser.close()


def test_attendance_suppresses_superseded_success_and_error():
    """Control promise resolution order without timing guesses or backend writes."""
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        page.route('http://guardian.test/app', lambda route: route.fulfill(content_type='text/html', body=HTML))
        page.goto('http://guardian.test/app')
        page.wait_for_selector('#loginForm')
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
        assert page.evaluate('state.attendance[0].name') == 'A-new'
        # A -> B, old A cannot overwrite B.
        page.evaluate("start('A');start('B');finish(4,'B-new');finish(3,'A-older')")
        page.wait_for_function("state.attendance[0]?.name==='B-new'")
        # Same branch, query and filter races, including a superseded failure.
        page.evaluate("start('B','old');start('B','new','not_in');finish(6,'query-new');pending[5].reject(new Error('stale query error'))")
        page.wait_for_function("state.attendance[0]?.name==='query-new'")
        assert page.evaluate('errors') == []
        page.evaluate("start('B','new','all');start('B','new','checked_in');finish(8,'filter-new');finish(7,'filter-old')")
        page.wait_for_function("state.attendance[0]?.name==='filter-new'")
        # Changed session invalidates a response even for same branch/query/filter.
        page.evaluate("start('B');state.token='session-2';pending[9].reject(new Error('old session error'))")
        assert page.evaluate('errors') == []
        # Current failures still reach caller; they aren't silently swallowed.
        page.evaluate("start('B');pending[10].reject(new Error('current error'))")
        page.wait_for_function("errors.includes('current error')")
        assert page.evaluate('errors') == ['current error']
        browser.close()


@pytest.mark.parametrize('failure,expected', [
    ('credentials', 'Wrong password or user ID. Try again.'),
    ('throttle', 'Too many failed sign-in attempts. Try again later.'),
    ('server', 'Service unavailable'),
    ('network', 'Cannot reach the Guardian server. Check the connection and try again.'),
])
def test_login_error_feedback(failure, expected, tmp_path):
    def respond(route):
        if urlsplit(route.request.url).path == '/app':
            return route.fulfill(content_type='text/html', body=HTML)
        if failure == 'network':
            return route.abort()
        status, detail = {
            'credentials': (401, 'Invalid user ID or password'),
            'throttle': (429, 'Too many failed sign-in attempts. Try again later.'),
            'server': (503, 'Service unavailable'),
        }[failure]
        route.fulfill(status=status, content_type='application/json', body=json.dumps({'detail': detail}))

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        page.route('http://guardian.test/**', respond)
        page.goto('http://guardian.test/app')
        page.locator('[name=username]').fill('supervisor.demo')
        page.locator('[name=password]').fill('incorrect-local-test')
        page.locator('#loginForm .primary').click()
        page.wait_for_selector('.error')
        assert page.locator('.error').inner_text() == expected
        assert page.locator('.error').is_visible()
        box = page.locator('.error').bounding_box()
        assert box['y'] >= 0 and box['y'] + box['height'] < 844
        assert box['y'] < page.locator('[name=username]').bounding_box()['y']
        assert page.locator('h1').inner_text() == 'Guardian'
        assert page.evaluate("localStorage.getItem('gf_token')") is None
        page.screenshot(path=str(tmp_path / ('login-' + failure + '.png')))
        browser.close()
