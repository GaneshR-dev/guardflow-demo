"""Shared helpers for the browser tests of the React app at /next."""

import mimetypes
from pathlib import Path
from urllib.parse import urlsplit

DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"


def fulfill_next(route):
    """Serve frontend/dist at /next, like FastAPI does. Return False for other paths."""
    path = urlsplit(route.request.url).path
    if not path.startswith("/next"):
        return False
    target = DIST / path.removeprefix("/next/").removeprefix("/next")
    if not target.is_file():
        target = DIST / "index.html"
    content_type = mimetypes.guess_type(target.name)[0] or "text/html"
    route.fulfill(content_type=content_type, body=target.read_bytes())
    return True
