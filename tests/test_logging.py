"""Tests for the application log: one line per API request, sign-in events, the 500 handler.

The log must never hold passwords, tokens, typed usernames or request bodies.
"""

import json
import logging
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import SERVER_ERROR, app
from demo_logging import JsonFormatter, clean_fields, event, setup_logging
from demo_security import login_throttle_clear
from fastapi.testclient import TestClient

client = TestClient(app)
FORMAT = JsonFormatter()


def auth(username="admin.demo", password="demo123"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def lines(caplog):
    """The log lines as the host sees them (JSON) and as dicts."""
    records = [r for r in caplog.records if r.name == "guardian"]
    text_lines = [FORMAT.format(r) for r in records]
    return text_lines, [json.loads(t) for t in text_lines]


# ---- Unit tests ----


def test_json_formatter_writes_one_json_line_with_fields():
    record = logging.LogRecord("guardian", logging.INFO, __file__, 1, "request", None, None)
    record.fields = {"route": "/api/x", "status": 200}
    out = FORMAT.format(record)
    assert "\n" not in out
    data = json.loads(out)
    assert data["event"] == "request" and data["level"] == "info"
    assert data["route"] == "/api/x" and data["status"] == 200
    assert data["ts"].endswith("+00:00")


def test_clean_fields_removes_sensitive_keys():
    fields = {"password": "x", "Token": "y", "authorization": "z", "phone": "1", "username": "u", "route": "/api/x"}
    assert clean_fields(fields) == {"route": "/api/x"}


def test_setup_logging_adds_one_handler_only():
    before = len(setup_logging().handlers)
    assert len(setup_logging().handlers) == before


def test_event_with_exc_info_keeps_the_stack_trace(caplog):
    caplog.set_level(logging.INFO, logger="guardian")
    try:
        raise ValueError("boom")
    except ValueError:
        event(logging.ERROR, "unit.error", exc_info=True)
    _, data = lines(caplog)
    assert "ValueError: boom" in data[-1]["error"]


# ---- Integration tests ----


def test_api_request_gives_one_log_line_and_a_request_id(caplog):
    headers = auth()
    caplog.clear()
    caplog.set_level(logging.INFO, logger="guardian")
    response = client.get("/api/locations", headers=headers)
    assert response.status_code == 200
    request_id = response.headers["X-Request-ID"]
    _, data = lines(caplog)
    rows = [d for d in data if d["event"] == "request"]
    assert len(rows) == 1
    row = rows[0]
    assert row["route"] == "/api/locations" and row["method"] == "GET" and row["status"] == 200
    assert row["request_id"] == request_id
    assert row["user_id"] == "admin.demo" and row["role"] == "admin"
    assert isinstance(row["ms"], float)


def test_route_template_keeps_ids_and_query_out_of_the_log(caplog):
    headers = auth()
    caplog.clear()
    caplog.set_level(logging.INFO, logger="guardian")
    client.get("/api/reports/monthly?month=2026-11&location_id=loc-secret-query", headers=headers)
    client.delete("/api/employees/emp-not-there-xyz", headers=headers)
    text_lines, data = lines(caplog)
    assert not any("loc-secret-query" in t or "emp-not-there-xyz" in t for t in text_lines)
    assert "/api/employees/{employee_id}" in [d.get("route") for d in data]


def test_health_and_static_files_are_not_logged(caplog):
    caplog.set_level(logging.INFO, logger="guardian")
    caplog.clear()
    client.get("/api/health")
    client.get("/app")
    _, data = lines(caplog)
    assert [d for d in data if d["event"] == "request"] == []


def test_failed_sign_in_logs_no_username_and_no_password(caplog):
    username, password = "nobody.logtest", "S3cret-pass-logtest!"
    caplog.set_level(logging.INFO, logger="guardian")
    caplog.clear()
    try:
        response = client.post("/api/login", json={"username": username, "password": password})
        assert response.status_code == 401
    finally:
        login_throttle_clear(username)
    text_lines, data = lines(caplog)
    assert "login.failed" in [d["event"] for d in data]
    assert not any(username in t or password in t for t in text_lines)
    assert any(d["event"] == "request" and d["status"] == 401 and d["level"] == "warning" for d in data)


def test_successful_sign_in_logs_user_id_but_not_the_token(caplog):
    caplog.set_level(logging.INFO, logger="guardian")
    caplog.clear()
    token = auth()["Authorization"].split()[1]
    client.get("/api/locations", headers={"Authorization": "Bearer " + token})
    text_lines, data = lines(caplog)
    ok = [d for d in data if d["event"] == "login.ok"]
    assert ok and ok[0]["user_id"] == "admin.demo"
    assert not any(token in t or "demo123" in t for t in text_lines)


def test_disabled_account_sign_in_logs_user_id_but_not_the_password(caplog):
    user_id, password = "sup.logdisabled", "temporary-pass-log1"
    created = client.post(
        "/api/settings/access",
        headers=auth(),
        json={
            "id": user_id,
            "name": "Log Test",
            "password": password,
            "role": "supervisor",
            "location_ids": ["loc-hsr"],
        },
    )
    assert created.status_code == 200, created.text
    assert client.delete(f"/api/settings/access/{user_id}", headers=auth()).status_code == 200
    caplog.set_level(logging.INFO, logger="guardian")
    caplog.clear()
    try:
        response = client.post("/api/login", json={"username": user_id, "password": password})
        assert response.status_code == 403
    finally:
        login_throttle_clear(user_id)
    text_lines, data = lines(caplog)
    disabled = [d for d in data if d["event"] == "login.disabled"]
    assert disabled and disabled[0]["user_id"] == user_id and disabled[0]["level"] == "warning"
    assert "login.ok" not in [d["event"] for d in data]
    request = [d for d in data if d["event"] == "request" and d["status"] == 403]
    assert request and request[0]["user_id"] == user_id
    assert not any(password in t for t in text_lines)


def test_401_and_403_are_logged_as_warnings(caplog):
    supervisor = auth("supervisor.demo")
    caplog.set_level(logging.INFO, logger="guardian")
    caplog.clear()
    assert client.get("/api/locations").status_code == 401
    assert client.get("/api/audit/export", headers=supervisor).status_code == 403
    _, data = lines(caplog)
    statuses = {d["status"]: d for d in data if d["event"] == "request"}
    assert statuses[401]["level"] == "warning" and statuses[401]["user_id"] is None
    assert statuses[403]["level"] == "warning" and statuses[403]["role"] == "supervisor"


def test_unhandled_error_gives_plain_500_and_logs_the_stack_trace(caplog):
    path = "/api/test-only-boom"
    if not any(getattr(r, "path", None) == path for r in app.routes):

        @app.get(path)
        def boom():
            raise RuntimeError("internal detail that users must not see")

    caplog.set_level(logging.INFO, logger="guardian")
    caplog.clear()
    response = client.get(path)
    assert response.status_code == 500
    assert response.json() == {"detail": SERVER_ERROR}
    assert "internal detail" not in response.text
    assert response.headers["X-Request-ID"]
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    _, data = lines(caplog)
    errors = [d for d in data if d["event"] == "request.error"]
    assert len(errors) == 1
    assert errors[0]["status"] == 500 and errors[0]["level"] == "error"
    assert "RuntimeError: internal detail" in errors[0]["error"]
