"""Application logs for the Guardian API.

One JSON line per event on stderr (the console). The host (ethiodeploy) stores and shows it.
Never log request bodies, passwords, tokens, names or phone numbers. Business actions
(who changed what) go to the audit table through audit(), not to this log.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone

LOGGER_NAME = "guardian"
# Safety net: these keys are removed from log fields even if a caller passes them.
SENSITIVE_KEYS = {"password", "token", "authorization", "cookie", "phone", "name", "username"}

log = logging.getLogger(LOGGER_NAME)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "event": record.getMessage(),
        }
        entry.update(clean_fields(getattr(record, "fields", None) or {}))
        if record.exc_info:
            entry["error"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def clean_fields(fields: dict) -> dict:
    return {key: value for key, value in fields.items() if key.lower() not in SENSITIVE_KEYS}


def setup_logging() -> logging.Logger:
    """Configure the "guardian" logger one time. LOG_LEVEL sets the level (default INFO)."""
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    # getLevelName() returns an int only for a known level name (works on Python 3.10).
    log.setLevel(level if isinstance(logging.getLevelName(level), int) else "INFO")
    if not any(getattr(handler, "_guardian", False) for handler in log.handlers):
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(JsonFormatter())
        handler._guardian = True
        log.addHandler(handler)
    return log


def event(level: int, name: str, exc_info: bool = False, **fields) -> None:
    """Log one event with extra fields, for example event(logging.WARNING, "login.failed")."""
    log.log(level, name, exc_info=exc_info, extra={"fields": fields})
