"""Sequential shifts retain history, prevent parallel work, and require confirmation."""

import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import pytest
from demo_app import app, local_today
from demo_db import _allow_sequential_attendance, engine
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

client = TestClient(app)


def auth(username="admin.demo"):
    response = client.post("/api/login", json={"username": username, "password": "demo123"})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


@pytest.fixture
def employee():
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO demo_employees (id,name,phone,role,location_id,active,company_id) VALUES ('SEQTEST','Sequential Guard','9990005511','Guard','loc-hsr',1,'company-1')"
            )
        )
    yield "SEQTEST"
    with engine.begin() as c:
        c.execute(text("DELETE FROM demo_attendance WHERE employee_id='SEQTEST'"))
        c.execute(text("DELETE FROM demo_audit WHERE details LIKE '%SEQTEST%'"))
        c.execute(text("DELETE FROM demo_employees WHERE id='SEQTEST'"))


def mark(path, employee, location, headers, **extra):
    return client.post(
        "/api/attendance/" + path, headers=headers, json={"employee_id": employee, "location_id": location, **extra}
    )


def records(employee):
    with engine.connect() as c:
        return [
            dict(r)
            for r in c.execute(
                text("SELECT * FROM demo_attendance WHERE employee_id=:e ORDER BY check_in"), {"e": employee}
            ).mappings()
        ]


def test_parallel_cross_site_block_and_confirmed_second_shift(employee):
    headers = auth()
    locations = client.get("/api/locations", headers=headers).json()
    second = next(loc["id"] for loc in locations if loc["id"] != "loc-hsr" and loc["active"])
    assert mark("checkin", employee, "loc-hsr", headers).json()["status"] == "checked_in"
    first = records(employee)[0]
    blocked = mark("checkin", employee, second, headers, confirm_second_shift=True)
    assert blocked.status_code == 409
    assert "check-out first" in blocked.json()["detail"]
    assert records(employee) == [first]
    assert mark("checkout", employee, "loc-hsr", headers).status_code == 200
    closed = records(employee)[0]
    warning = mark("checkin", employee, second, headers)
    assert warning.json()["requires_confirmation"] is True
    assert warning.json()["prior_shifts"] == 1
    assert records(employee) == [closed]  # Cancel/no confirmation cannot create a shift.
    assert mark("checkin", employee, second, headers, confirm_second_shift=True).json()["status"] == "checked_in"
    assert len(records(employee)) == 2
    assert records(employee)[0] == closed
    assert mark("checkout", employee, second, headers).status_code == 200
    # A third shift at the original site also keeps both earlier shifts.
    assert mark("checkin", employee, "loc-hsr", headers).json()["prior_shifts"] == 2
    assert mark("checkin", employee, "loc-hsr", headers, confirm_second_shift=True).status_code == 200
    assert len(records(employee)) == 3
    summary = client.get("/api/attendance?location_id=loc-hsr", headers=headers).json()["summary"]
    assert summary["checked_in"] >= 1
    overview = client.get("/api/dashboard", headers=headers)
    assert overview.status_code == 200
    report = client.get(
        "/api/reports/monthly", headers=headers, params={"month": local_today().strftime("%Y-%m")}
    ).json()
    mine = [r for r in report["rows"] if r["employee_id"] == employee]
    assert len(mine) == 3
    assert sum(r["status"] == "completed" for r in mine) == 2
    assert sorted((r["check_in"], r["check_out"]) for r in mine) == sorted(
        (r["check_in"], r["check_out"]) for r in records(employee)
    )
    from io import BytesIO

    from openpyxl import load_workbook

    response = client.get(
        "/api/reports/export.xlsx", headers=headers, params={"month": local_today().strftime("%Y-%m")}
    )
    assert response.status_code == 200
    sheet = load_workbook(BytesIO(response.content))["Attendance"]
    exported = [r for r in sheet.iter_rows(min_row=2, values_only=True) if r[3] == employee]
    assert len(exported) == 3
    assert sum(r[2] is not None for r in exported) == 2


def test_second_shift_permissions_and_validation(employee):
    admin, supervisor = auth(), auth("supervisor.demo")
    assert mark("checkin", employee, "loc-hsr", {}).status_code == 401
    assert mark("checkin", employee, "missing-site", admin).status_code == 404
    assert mark("checkin", "MISSINGEMPLOYEE", "loc-hsr", admin).status_code == 404
    locations = client.get("/api/locations", headers=admin).json()
    permitted = {loc["id"] for loc in client.get("/api/locations", headers=supervisor).json()}
    denied = next((loc["id"] for loc in locations if loc["id"] not in permitted), None)
    if denied:
        assert mark("checkin", employee, denied, supervisor, confirm_second_shift=True).status_code == 403
    assert client.post("/api/attendance/checkin", headers=admin, json={"employee_id": employee}).status_code == 422
    with engine.begin() as c:
        c.execute(text("UPDATE demo_employees SET active=0 WHERE id=:e"), {"e": employee})
    assert mark("checkin", employee, "loc-hsr", admin).status_code == 409


def test_record_specific_time_edit_and_reopen_guard(employee):
    headers = auth()
    for _ in range(2):
        assert mark("checkin", employee, "loc-hsr", headers, confirm_second_shift=True).status_code == 200
        assert mark("checkout", employee, "loc-hsr", headers).status_code == 200
    rows = records(employee)
    body = {
        "employee_id": employee,
        "location_id": "loc-hsr",
        "day": local_today().isoformat(),
        "check_in": "08:00",
        "check_out": "09:00",
        "reason": "Test correction",
    }
    assert client.patch("/api/attendance/times", headers=headers, json=body).status_code == 409
    assert (
        client.patch("/api/attendance/times", headers=headers, json={**body, "record_id": rows[0]["id"]}).status_code
        == 200
    )
    assert records(employee)[1] == rows[1]
    assert mark("checkin", employee, "loc-hsr", headers, confirm_second_shift=True).status_code == 200
    assert (
        client.patch(
            "/api/attendance/times", headers=headers, json={**body, "record_id": rows[0]["id"], "check_out": None}
        ).status_code
        == 409
    )


def test_legacy_sqlite_migration_keeps_open_duty_and_is_idempotent(monkeypatch):
    import demo_db

    legacy = create_engine("sqlite:///:memory:")
    monkeypatch.setattr(demo_db, "engine", legacy)
    with legacy.begin() as c:
        c.execute(
            text(
                "CREATE TABLE demo_attendance (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, location_id TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, check_in TEXT, check_out TEXT, source TEXT NOT NULL, UNIQUE(employee_id,day))"
            )
        )
        c.execute(
            text(
                "INSERT INTO demo_attendance VALUES ('existing','NIGHT','site-a','2026-11-16','checked_in','2026-11-16T13:13:00+00:00',NULL,'live demo')"
            )
        )
        before = c.execute(text("SELECT * FROM demo_attendance")).all()
        _allow_sequential_attendance(c)
        _allow_sequential_attendance(c)
        assert c.execute(text("SELECT * FROM demo_attendance")).all() == before
        c.execute(
            text(
                "INSERT INTO demo_attendance VALUES ('next','NIGHT','site-b','2026-11-16','completed',NULL,NULL,'test')"
            )
        )


def test_postgresql_preservation_and_parallel_checkins(tmp_path):
    """Test the production dialect, legacy migration, and racing sites in isolation."""
    import subprocess

    pgserver = pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    server = pgserver.get_server(str(tmp_path / "pgsequential"))
    uri = server.get_uri().replace("postgresql://", "postgresql+psycopg://")
    script = r"""
import sys, threading, time
sys.path.insert(0,'backend')
from demo_app import app
from demo_db import engine, migrate_db
from fastapi.testclient import TestClient
from sqlalchemy import text
client=TestClient(app)
r=client.post('/api/login',json={'username':'admin.demo','password':'demo123'})
headers={'Authorization':'Bearer '+r.json()['token']}
with engine.begin() as c:
    c.execute(text("ALTER TABLE demo_attendance ADD CONSTRAINT legacy_employee_day UNIQUE(employee_id,day)"))
    c.execute(text("INSERT INTO demo_employees (id,name,phone,role,location_id,active,company_id) VALUES ('NIGHTKEEP','Night Keeper','9990008855','Guard','loc-hsr',1,'company-1')"))
    c.execute(text("INSERT INTO demo_attendance VALUES ('nightkeep','NIGHTKEEP','loc-hsr','2026-11-16','checked_in','2026-11-16T13:13:00+00:00',NULL,'live demo')"))
    before=c.execute(text('SELECT * FROM demo_attendance ORDER BY id')).all()
# A later migration failure must roll back the removed constraint and all data.
from unittest.mock import patch
with patch('demo_db._ensure_location_shifts', side_effect=RuntimeError('forced later failure')):
    try:migrate_db()
    except RuntimeError:pass
    else:raise AssertionError('injected failure did not run')
with engine.connect() as c:
    assert c.execute(text("SELECT 1 FROM pg_constraint WHERE conname='legacy_employee_day'")).first()
    assert c.execute(text('SELECT * FROM demo_attendance ORDER BY id')).all()==before
migrate_db();migrate_db()
with engine.begin() as c:
    assert c.execute(text('SELECT * FROM demo_attendance ORDER BY id')).all()==before
    c.execute(text("INSERT INTO demo_employees (id,name,phone,role,location_id,active,company_id) VALUES ('RACETEST','Race Guard','9990008856','Guard','loc-hsr',1,'company-1')"))
results=[]
ready=[threading.Event(),threading.Event()]
def checkin(index,loc):
    ready[index].set()
    r=client.post('/api/attendance/checkin',headers=headers,json={'employee_id':'RACETEST','location_id':loc})
    results.append(r.status_code)
with engine.begin() as c:
    c.execute(text("SELECT id FROM demo_employees WHERE id='RACETEST' FOR UPDATE"))
    threads=[threading.Thread(target=checkin,args=(0,'loc-hsr')),threading.Thread(target=checkin,args=(1,'loc-mysuru'))]
    for t in threads:t.start()
    for event in ready:assert event.wait(5)
    # The row held above must block both API calls before it is released.
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        c.execute(text('SELECT pg_stat_clear_snapshot()'))
        waiting=c.execute(text("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%demo_employees%' AND pid<>pg_backend_pid()" )).scalar()
        if waiting>=2:break
        time.sleep(.05)
    assert waiting>=2,waiting
for t in threads:t.join(10)
assert sorted(results)==[200,409],results
with engine.connect() as c:
    assert c.execute(text("SELECT count(*) FROM demo_attendance WHERE employee_id='RACETEST' AND status='checked_in'")).scalar()==1
    assert c.execute(text("SELECT * FROM demo_attendance WHERE id='nightkeep'")).first()==next(r for r in before if r[0]=='nightkeep')
print('SEQUENTIAL PG OK')
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        check=False,
        cwd=Path(__file__).resolve().parents[1],
        env=dict(os.environ, DATABASE_URL=uri, DEMO_MODE="true"),
        capture_output=True,
        text=True,
        timeout=40,
    )
    assert result.returncode == 0, result.stderr[-4000:]
    assert "SEQUENTIAL PG OK" in result.stdout


@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_taskbar_and_second_shift_warning_cancel_confirm(role, tmp_path):
    import json
    from urllib.parse import urlsplit

    playwright = pytest.importorskip("playwright.sync_api")
    root = Path(__file__).resolve().parents[1]
    calls = []
    user = {"id": role + ".demo", "name": "Sample " + role, "role": role}
    loc = {"id": "site-a", "name": "Site A", "area": "Test", "active": 1, "assigned_count": 1}

    def respond(route):
        path = urlsplit(route.request.url).path
        if path == "/app":
            return route.fulfill(body=(root / "attendance-app.html").read_text(), content_type="text/html")
        if path in ["/attendance-app.js", "/attendance-app.css"]:
            return route.fulfill(
                body=(root / path[1:]).read_text(),
                content_type="text/javascript" if path.endswith("js") else "text/css",
            )
        if path == "/api/attendance/checkin":
            data = route.request.post_data_json
            calls.append(data)
            return route.fulfill(
                json=(
                    {
                        "status": "checked_in",
                        "employee_id": "EMPSEQ",
                        "name": "Sample Guard",
                        "check_in": "2026-11-16T12:00:00Z",
                    }
                    if data.get("confirm_second_shift")
                    else {"requires_confirmation": True, "prior_shifts": 1}
                )
            )
        return route.fulfill(
            json={
                "/api/locations": [loc],
                "/api/settings": {"profile": user, "locations": [loc], "access": []},
                "/api/dashboard": {
                    "employees": 1,
                    "checked_in": 0,
                    "completed": 1,
                    "not_checked_in": 0,
                    "locations": [],
                },
                "/api/attendance": {
                    "rows": [
                        {
                            "id": "record-1",
                            "employee_id": "EMPSEQ",
                            "name": "Sample Guard",
                            "status": "completed",
                            "check_in": "2026-11-16T03:00:00Z",
                        }
                    ],
                    "summary": {"completed": 1},
                },
            }.get(path, {})
        )

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.add_init_script(
            "localStorage.setItem('gf_token','test');localStorage.setItem('gf_user',JSON.stringify("
            + json.dumps(user)
            + "))"
        )
        page.route("http://guardian.test/**", respond)
        page.goto("http://guardian.test/app")
        page.wait_for_function("state.screen==='dashboard'")
        assert page.locator(".menuButton").count() == 0
        assert page.locator(".bottomNav button").count() == 6
        page.locator("[data-nav=settings]").click()
        page.wait_for_selector("[data-settings=profile]")
        assert page.locator("#profileForm").count() == 0
        page.locator("[data-settings=profile]").click()
        page.wait_for_selector("#profileForm")
        assert page.locator("h1").inner_text() == "My profile"
        assert page.locator("[data-settings=access]").count() == 0
        page.locator('[data-settings=""]').click()
        page.wait_for_selector("[data-settings=access]")
        assert page.locator("#profileForm").count() == 0
        page.locator("[data-settings=access]").click()
        page.wait_for_selector("h1:text('User access')")
        if role == "admin":
            password = page.locator("#accessForm [name=password]")
            assert password.get_attribute("minlength") == "8"
            assert password.get_attribute("maxlength") == "100"
            assert page.locator("#accessForm label").all_text_contents()[2] == "Password"
        else:
            assert page.locator("#accessForm").count() == 0

        for width in [320, 390, 1280]:
            page.set_viewport_size({"width": width, "height": 844})
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
            assert all(
                size >= 44
                for size in page.locator(".bottomNav button").evaluate_all(
                    "els=>els.map(e=>e.getBoundingClientRect().height)"
                )
            )
        page.locator("[data-nav=attendance]").click()
        page.wait_for_selector("#attSearch")
        assert page.locator("[data-filter=completed]").inner_text() == "Checked out"
        assert page.locator("[data-go=checkout]").count() == 1
        page.locator("[data-go=add]").click()
        page.locator("[data-checkin=EMPSEQ]").click()
        assert page.locator("text=Are you sure you want to check in?").count() == 0
        page.wait_for_selector("text=Second shift today")
        assert len(calls) == 1 and calls[0]["confirm_second_shift"] is False
        page.locator("#confirmCancel").click()
        assert page.locator("#confirmOk").count() == 0
        assert len(calls) == 1
        page.locator("[data-checkin=EMPSEQ]").click()
        page.wait_for_selector("text=Second shift today")
        page.locator("#confirmOk").click()
        page.wait_for_function("state.notice==='Check-in recorded' && state.screen==='add'")
        assert [c["confirm_second_shift"] for c in calls] == [False, False, True]
        browser.close()


def test_recovery_switch_pauses_new_extra_shifts_without_changing_history(employee, monkeypatch):
    headers = auth()
    assert mark("checkin", employee, "loc-hsr", headers).status_code == 200
    assert mark("checkout", employee, "loc-hsr", headers).status_code == 200
    before = records(employee)
    monkeypatch.setenv("ALLOW_SEQUENTIAL_SHIFTS", "false")
    response = mark("checkin", employee, "loc-hsr", headers, confirm_second_shift=True)
    assert response.status_code == 409
    assert records(employee) == before
    assert client.get("/api/attendance?location_id=loc-hsr", headers=headers).status_code == 200
    assert (
        client.get(
            "/api/reports/monthly", headers=headers, params={"month": local_today().strftime("%Y-%m")}
        ).status_code
        == 200
    )
