"""The React build (frontend/dist) is served at /next while the screens move from the old app."""

import os
import sys

import pytest

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import demo_app
from fastapi.testclient import TestClient

client = TestClient(demo_app.app)


@pytest.fixture
def dist(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text('<div id="root"></div>')
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg></svg>")
    (tmp_path.parent / "secret.txt").write_text("secret")
    monkeypatch.setattr(demo_app, "NEXT_DIST", tmp_path)
    return tmp_path


def test_root_and_client_routes_return_index_without_cache(dist):
    for path in ("/next", "/next/", "/next/reports/day"):
        response = client.get(path)
        assert response.status_code == 200
        assert 'id="root"' in response.text
        assert response.headers["Cache-Control"] == "no-cache"


def test_hashed_asset_is_cached_long(dist):
    response = client.get("/next/assets/index-abc123.js")
    assert response.status_code == 200
    assert response.text == "console.log(1)"
    assert "immutable" in response.headers["Cache-Control"]


def test_public_file_is_not_cached_long(dist):
    response = client.get("/next/favicon.svg")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-cache"


def test_missing_asset_is_404_not_index(dist):
    response = client.get("/next/assets/missing.js")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


def test_path_outside_dist_is_not_served(dist):
    response = client.get("/next/..%2Fsecret.txt")
    assert "secret" not in response.text
    # Call the handler directly too, because the HTTP client can normalize the path.
    response = demo_app.next_frontend("../secret.txt")
    assert response.path == (dist / "index.html").resolve()


def test_missing_build_is_404_with_readable_message(tmp_path, monkeypatch):
    monkeypatch.setattr(demo_app, "NEXT_DIST", tmp_path / "missing")
    response = client.get("/next")
    assert response.status_code == 404
    assert response.json()["detail"] == "The new app is not built yet"


def test_old_app_is_unchanged():
    assert client.get("/app").status_code == 200
