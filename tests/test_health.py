"""/api/health tells the sign-in screen if the server is in demo mode."""

import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import DEMO_MODE, app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_reports_demo_mode_without_sign_in():
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert isinstance(body["demo_mode"], bool)
    assert body["demo_mode"] is DEMO_MODE


def test_health_does_not_show_credentials():
    text = client.get("/api/health").text
    assert "demo123" not in text
    assert "password" not in text.lower()
