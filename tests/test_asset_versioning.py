"""The frontend shell fingerprints its asset URLs and serves no-cache.

Covers the cache-consistency fix: each deploy changes the asset URLs when the
asset content changes, so browser and CDN caches never pair a new shell with a
stale bundle.
"""

import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_app import ASSET_VERSION, _asset_version, app
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent

client = TestClient(app)


def test_shell_references_fingerprinted_assets_and_is_no_cache():
    response = client.get("/app")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-cache"
    assert f'href="/attendance-app.css?v={ASSET_VERSION}"' in response.text
    assert f'src="/attendance-app.js?v={ASSET_VERSION}"' in response.text
    assert 'href="/attendance-app.css"' not in response.text
    assert 'src="/attendance-app.js"' not in response.text


def test_fingerprint_matches_current_asset_contents():
    assert ASSET_VERSION == _asset_version(ROOT / "attendance-app.js", ROOT / "attendance-app.css")


def test_fingerprint_changes_when_content_changes(tmp_path):
    first = tmp_path / "a.js"
    second = tmp_path / "b.js"
    first.write_text("console.log('one')")
    second.write_text("console.log('two')")
    assert _asset_version(first) != _asset_version(second)
    second.write_text("console.log('one')")
    assert _asset_version(first) == _asset_version(second)


def test_fingerprinted_asset_urls_serve_identical_bytes():
    for name in ("attendance-app.js", "attendance-app.css"):
        plain = client.get(f"/{name}")
        versioned = client.get(f"/{name}?v={ASSET_VERSION}")
        assert plain.status_code == versioned.status_code == 200
        assert versioned.content == (ROOT / name).read_bytes() == plain.content
