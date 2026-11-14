"""Durable regression tests for the Nov 14 security patch (PR #8).

Covers: crafted-link API override, response security headers, malformed
attendance day input, CSV formula neutralization and DB-backed login
throttling, including persistence of a lockout across an app restart.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from demo_app import app, csv_cell_safe, local_today
from demo_db import engine
from fastapi.testclient import TestClient
from sqlalchemy import text

client = TestClient(app)

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"
HTML = (REPO / "attendance-app.html").read_text()
CSS = (REPO / "attendance-app.css").read_text()
JS = (REPO / "attendance-app.js").read_text()


def auth():
    response = client.post("/api/login", json={"username": "admin.demo", "password": "demo123"})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def test_frontend_never_reads_api_origin_from_page_url():
    """Static guard for the crafted-link fix: no ?api= override mechanism may exist."""
    assert re.search(r"const\s+API\s*=\s*''", JS)
    assert not re.search(r"[?&]api=", JS)
    # The override used to read the page's query string; URLSearchParams may
    # legitimately appear for building outbound request queries.
    assert "location.search" not in JS


def test_crafted_link_cannot_redirect_api_calls():
    """Runtime guard: with ?api=https://evil... in the URL, every request stays same-origin."""
    playwright = pytest.importorskip("playwright.sync_api")
    escaped = []

    def respond(route):
        path = urlsplit(route.request.url).path
        assets = {
            "/app": ("text/html", HTML),
            "/attendance-app.css": ("text/css", CSS),
            "/attendance-app.js": ("text/javascript", JS),
        }
        if path in assets:
            content_type, body = assets[path]
            return route.fulfill(content_type=content_type, body=body)
        body = {
            "/api/login": {"token": "probe-token", "user": {"id": "probe", "name": "Probe", "role": "admin"}},
            "/api/locations": [],
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(body))

    def trap(route):
        escaped.append(route.request.url)
        route.abort()

    with playwright.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page()
        page.route("http://guardian.test/**", respond)
        page.route(re.compile(r"^https?://(?!guardian\.test)"), trap)
        page.goto("http://guardian.test/app?api=https://evil-capture.example")
        page.locator("[name=username]").fill("synthetic-probe")
        page.locator("[name=password]").fill("synthetic-probe")
        with page.expect_response(lambda r: "/api/login" in r.url):
            page.locator("#loginForm .primary").click()
        browser.close()
    assert escaped == []


def test_frontend_assets_are_served():
    assert client.get("/attendance-app.css").headers["content-type"].startswith("text/css")
    assert client.get("/attendance-app.js").headers["content-type"].startswith("text/javascript")


def test_security_headers_on_api_and_app():
    for path in ["/api/health", "/app"]:
        response = client.get(path)
        assert response.status_code == 200
        csp = response.headers["content-security-policy"]
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "max-age=31536000" in response.headers["strict-transport-security"]


def test_attendance_rejects_malformed_day_without_500():
    headers = auth()
    base = "/api/attendance?location_id=loc-hsr"
    assert client.get(base + "&day=not-a-date", headers=headers).status_code == 422
    impossible = client.get(base + "&day=2026-13-99", headers=headers)
    assert impossible.status_code == 400
    assert impossible.json()["detail"] == "Invalid day"
    assert client.get(base, headers=headers).status_code == 200


def test_csv_cell_safe_prefixes_formula_triggers():
    for trigger in ("=", "+", "-", "@", "\t", "\r"):
        assert csv_cell_safe(trigger + "2+3") == "'" + trigger + "2+3"
    assert csv_cell_safe("Ordinary Guard") == "Ordinary Guard"
    assert csv_cell_safe(2026) == 2026
    assert csv_cell_safe(None) is None


def test_csv_export_neutralizes_employee_name_formulas():
    headers = auth()
    created = client.post(
        "/api/employees",
        headers=headers,
        json={"name": "=2+5+cmd", "phone": "+91 90000 00000", "role": "Guard", "location_id": "loc-hsr"},
    )
    assert created.status_code == 200
    employee_id = created.json()["id"]
    checked = client.post(
        "/api/attendance/checkin", headers=headers, json={"employee_id": employee_id, "location_id": "loc-hsr"}
    )
    assert checked.status_code == 200
    month = local_today().isoformat()[:7]
    exported = client.get("/api/reports/export.csv?month=" + month, headers=headers)
    assert exported.status_code == 200
    lines = [line for line in exported.text.splitlines() if employee_id in line]
    assert lines, "export should include the checked-in employee"
    for line in lines:
        assert "'=2+5+cmd" in line
        assert ",=2+5+cmd" not in line


def test_throttle_failures_are_stored_in_database():
    with engine.begin() as c:
        c.execute(text("DELETE FROM demo_login_attempts WHERE username='persist.probe'"))
    for _ in range(2):
        denied = client.post("/api/login", json={"username": "persist.probe", "password": "wrong"})
        assert denied.status_code == 401
    with engine.connect() as c:
        count = c.execute(text("SELECT COUNT(*) FROM demo_login_attempts WHERE username='persist.probe'")).scalar()
    assert count == 2


def test_lockout_survives_app_restart(tmp_path):
    """Two separate processes share one DB file: the second still sees the lockout."""
    db_path = tmp_path / "restart-probe.db"
    env = dict(os.environ, DATABASE_URL="sqlite:///" + str(db_path))

    def run(phase):
        program = (
            "import sys; sys.path.insert(0, %r)\n"
            "from fastapi.testclient import TestClient\n"
            "from demo_app import app\n"
            "c = TestClient(app)\n"
            "codes = [c.post('/api/login', json={'username': 'restart.probe', 'password': 'wrong'}).status_code"
            " for _ in range(%d)]\n"
            "expected = %r\n"
            "assert codes == expected, codes\n"
        ) % (str(BACKEND), 5 if phase == 1 else 1, [401] * 5 if phase == 1 else [429])
        result = subprocess.run([sys.executable, "-c", program], env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

    run(1)  # five failures in the first process
    run(2)  # sixth attempt in a fresh process is locked out
