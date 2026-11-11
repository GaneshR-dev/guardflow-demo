import os, sys
from pathlib import Path
from datetime import timedelta
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from fastapi.testclient import TestClient
from demo_app import app, local_today

client = TestClient(app)

def auth(username='admin.demo', password='demo123'):
    response = client.post('/api/login', json={'username': username, 'password': password})
    assert response.status_code == 200
    return {'Authorization': 'Bearer ' + response.json()['token']}

def test_login_locations_and_dashboard():
    headers = auth()
    assert client.get('/api/locations', headers=headers).status_code == 200
    dashboard = client.get('/api/dashboard', headers=headers).json()
    assert dashboard['employees'] == 54
    assert len(dashboard['locations']) == 3

def test_attendance_checkin_checkout_and_months():
    headers = auth('supervisor.demo')
    today = local_today().isoformat()
    attendance = client.get('/api/attendance?location_id=loc-hsr', headers=headers).json()
    assert attendance['summary'] == {'checked_in': 16, 'completed': 3, 'not_in': 5}
    waiting = next(row for row in attendance['rows'] if row['status'] == 'not_in')
    checked = client.post('/api/attendance/checkin', headers=headers, json={'employee_id': waiting['employee_id'], 'location_id': 'loc-hsr'})
    assert checked.status_code == 200
    assert checked.json()['status'] == 'checked_in'
    duplicate = client.post('/api/attendance/checkin', headers=headers, json={'employee_id': waiting['employee_id'], 'location_id': 'loc-hsr'})
    assert duplicate.status_code == 409
    completed = client.post('/api/attendance/checkout', headers=headers, json={'employee_id': waiting['employee_id'], 'location_id': 'loc-hsr'})
    assert completed.status_code == 200
    assert completed.json()['status'] == 'completed'
    months = client.get('/api/reports/months?months=6', headers=headers).json()
    assert len(months) == 6
    assert all(month['total_records'] > 0 for month in months)
    refreshed = client.get('/api/attendance?location_id=loc-hsr&day=' + today, headers=headers).json()
    assert next(row for row in refreshed['rows'] if row['employee_id'] == waiting['employee_id'])['status'] == 'completed'

def test_employee_create_import_and_persistence():
    headers = auth()
    created = client.post('/api/employees', headers=headers, json={'name': 'Test Guard', 'phone': '+91 90000 99999', 'role': 'Guard', 'location_id': 'loc-mysuru'})
    assert created.status_code == 200
    employee_id = created.json()['id']
    imported = client.post('/api/employees/import', headers=headers, json={'rows': [
        {'id': 'EMP9001', 'name': 'Imported Guard', 'phone': '+91 90000 90001', 'role': 'Guard', 'location_id': 'loc-mysuru'},
        {'id': employee_id, 'name': 'Test Guard Updated', 'phone': '+91 90000 99999', 'role': 'Guard', 'location_id': 'loc-mysuru'},
    ]})
    assert imported.status_code == 200
    assert imported.json() == {'created': 1, 'updated': 1}
    employees = client.get('/api/employees?location_id=loc-mysuru&q=Guard', headers=headers).json()
    assert any(row['id'] == employee_id and row['name'] == 'Test Guard Updated' for row in employees)
    assert any(row['id'] == 'EMP9001' for row in employees)

def test_supervisor_location_scope_and_import_validation():
    headers = auth('supervisor.demo')
    locations = client.get('/api/locations', headers=headers).json()
    assert {row['id'] for row in locations} == {'loc-hsr', 'loc-whitefield'}
    assert client.get('/api/attendance?location_id=loc-mysuru', headers=headers).status_code == 403
    assert client.get('/api/employees?location_id=loc-mysuru', headers=headers).status_code == 403
    denied_role = client.post('/api/employees/import', headers=headers, json={'rows': [
        {'id': 'EMP9100', 'name': 'Role Guard', 'phone': '+91 90000 91000', 'role': 'Supervisor', 'location_id': 'loc-hsr'}
    ]})
    assert denied_role.status_code == 403
    duplicate = client.post('/api/employees/import', headers=headers, json={'rows': [
        {'id': 'EMP9101', 'name': 'Duplicate One', 'phone': '+91 90000 91011', 'role': 'Guard', 'location_id': 'loc-hsr'},
        {'id': 'EMP9101', 'name': 'Duplicate Two', 'phone': '+91 90000 91012', 'role': 'Guard', 'location_id': 'loc-hsr'},
    ]})
    assert duplicate.status_code == 400
    assert not any(row['id'] == 'EMP9101' for row in client.get('/api/employees?location_id=loc-hsr&q=9101', headers=headers).json())
    rollback = client.post('/api/employees/import', headers=headers, json={'rows': [
        {'id': 'EMP9102', 'name': 'Rollback Guard', 'phone': '+91 90000 91021', 'role': 'Guard', 'location_id': 'loc-hsr'},
        {'id': 'EMP9103', 'name': 'Denied Guard', 'phone': '+91 90000 91031', 'role': 'Guard', 'location_id': 'loc-mysuru'},
    ]})
    assert rollback.status_code == 403
    employees = client.get('/api/employees?location_id=loc-hsr&q=910', headers=headers).json()
    assert not any(row['id'] in ('EMP9102', 'EMP9103') for row in employees)
    malformed = client.post('/api/employees/import', headers=headers, json={'rows': [
        {'id': 'EMP9104', 'name': 'Broken Guard', 'role': 'Guard', 'location_id': 'loc-hsr'}
    ]})
    assert malformed.status_code == 422


def test_employee_level_reports_filters_and_scope():
    headers = auth('supervisor.demo')
    today = local_today().isoformat()
    month = today[:7]
    daily = client.get(f'/api/reports/monthly?month={month}&day={today}&location_id=loc-hsr', headers=headers)
    assert daily.status_code == 200
    rows = daily.json()['rows']
    assert rows and all(row['day'] == today and row['location_id'] == 'loc-hsr' for row in rows)
    assert {'employee_id', 'employee_name', 'check_in', 'check_out', 'hours'} <= set(rows[0])
    assert any(row['hours'] and row['hours'] > 0 for row in rows if row['status'] == 'completed')
    assert client.get(f'/api/reports/monthly?month={month}&day=2020-01-01&location_id=loc-hsr', headers=headers).status_code == 400
    assert client.get(f'/api/reports/monthly?month={month}&location_id=loc-mysuru', headers=headers).status_code == 403
    assert client.get(f'/api/reports/export.csv?month={month}&location_id=loc-mysuru', headers=headers).status_code == 403
    supervisor_months = client.get('/api/reports/months?months=1', headers=headers).json()[0]
    admin_months = client.get('/api/reports/months?months=1', headers=auth()).json()[0]
    assert supervisor_months['total_records'] < admin_months['total_records']


def test_settings_backed_flows_and_permissions():
    supervisor = auth('supervisor.demo')
    settings = client.get('/api/settings', headers=supervisor).json()
    assert settings['profile']['id'] == 'supervisor.demo'
    assert {row['id'] for row in settings['locations']} == {'loc-hsr', 'loc-whitefield'}
    assert settings['access'] == [{'id': 'supervisor.demo', 'name': 'Supervisor Demo', 'role': 'supervisor', 'location_ids': ['loc-hsr', 'loc-whitefield']}]
    saved = client.patch('/api/settings/profile', headers=supervisor, json={'name': 'Supervisor Verified'})
    assert saved.status_code == 200
    assert client.get('/api/settings', headers=supervisor).json()['profile']['name'] == 'Supervisor Verified'
    assert client.post('/api/settings/locations', headers=supervisor, json={'id': 'loc-denied', 'name': 'Denied Site', 'area': 'No Access', 'assigned_count': 0}).status_code == 403
    assert client.post('/api/settings/access', headers=supervisor, json={'id': 'denied.user', 'name': 'Denied User', 'password': 'long-enough-password', 'role': 'supervisor', 'location_ids': ['loc-hsr']}).status_code == 403
    admin = auth()
    created_location = client.post('/api/settings/locations', headers=admin, json={'id': 'loc-test', 'name': 'Test Site', 'area': 'Test Area', 'assigned_count': 0})
    assert created_location.status_code == 200
    created_user = client.post('/api/settings/access', headers=admin, json={'id': 'test.supervisor', 'name': 'Test Supervisor', 'password': 'long-enough-password', 'role': 'supervisor', 'location_ids': ['loc-test']})
    assert created_user.status_code == 200
    scoped = auth('test.supervisor', 'long-enough-password')
    assert [row['id'] for row in client.get('/api/locations', headers=scoped).json()] == ['loc-test']

def test_demo_credentials_not_seeded_when_demo_mode_off(tmp_path):
    import subprocess
    database = tmp_path / 'production-like.db'
    env = dict(os.environ)
    env['DATABASE_URL'] = 'sqlite:///' + str(database)
    env['DEMO_MODE'] = 'false'
    env['PYTHONPATH'] = os.path.join(os.path.dirname(__file__), '..', 'backend')
    result = subprocess.run(
        [sys.executable, '-c', "from demo_app import engine; from sqlalchemy import text; c=engine.connect(); print(c.execute(text('SELECT COUNT(*) FROM demo_users')).scalar())"],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == '0'


def test_frontend_dashboard_labels_and_link_button():
    html = (Path(__file__).resolve().parents[1] / "attendance-app.html").read_text()
    assert "${l.today.checked_in} checked in" in html
    assert "${l.today.completed} completed" in html
    assert "${l.today.checked_in+l.today.completed} checked in" not in html
    assert ".link{border:0;background:transparent;padding:0;" in html
    assert "async function exportMonth(month)" in html
    assert "{headers:{Authorization:'Bearer '+state.token}}" in html
    assert "URL.createObjectURL(blob)" in html
    assert "a.href=API+'/api/reports/export.csv?month='+month" not in html
    assert "<title>Guardian Attendance</title>" in html
    assert '<span class="brand">Guardian</span>' in html
    assert 'class="avatar"' not in html
    assert 'data-locaction="${k}"' in html
    assert "['add','Add location','Create a new branch']" in html
    assert "['import','Import locations','Upload a CSV location list']" in html
    assert "history.pushState" in html
    assert "window.addEventListener('popstate'" in html


def test_future_day_attendance_and_location_import():
    headers = auth()
    future = (local_today() + timedelta(days=1)).isoformat()
    attendance = client.get('/api/attendance?location_id=loc-hsr&day=' + future, headers=headers).json()
    assert len(attendance['rows']) == 24
    assert attendance['summary'] == {'checked_in': 0, 'completed': 0, 'not_in': 24}
    imported = client.post('/api/settings/locations/import', headers=headers, json={'rows': [
        {'id': 'loc-import', 'name': 'Imported Branch', 'area': 'Import Area', 'assigned_count': 0},
        {'name': 'Generated Branch', 'area': 'Generated Area', 'assigned_count': 0},
    ]})
    assert imported.status_code == 200
    assert imported.json() == {'created': 2, 'updated': 0}
    updated = client.post('/api/settings/locations/import', headers=headers, json={'rows': [
        {'id': 'loc-import', 'name': 'Imported Branch Updated', 'area': 'Import Area', 'assigned_count': 0},
    ]})
    assert updated.status_code == 200
    assert updated.json() == {'created': 0, 'updated': 1}
    locations = client.get('/api/locations', headers=headers).json()
    assert any(row['id'] == 'loc-import' and row['name'] == 'Imported Branch Updated' for row in locations)
    assert any(row['name'] == 'Generated Branch' for row in locations)
