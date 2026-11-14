"""Authentication helpers for the Guardian attendance demo API: password hashing, session token digests and login throttling."""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import date, datetime, time, timedelta, timezone

from demo_db import LOCAL_TZ, engine
from fastapi import HTTPException
from sqlalchemy import text

LOGIN_MAX_FAILURES = int(os.environ.get("LOGIN_MAX_FAILURES", "5"))
LOGIN_LOCK_SECONDS = int(os.environ.get("LOGIN_LOCK_SECONDS", "900"))


def login_throttle_check(key: str) -> None:
    """Reject when too many recent failures for this username. Stored in the database so restarts do not reset the lockout."""
    cutoff = (utcnow() - timedelta(seconds=LOGIN_LOCK_SECONDS)).isoformat()
    with engine.begin() as c:
        c.execute(text("DELETE FROM demo_login_attempts WHERE at<:cutoff"), {"cutoff": cutoff})
        count = (
            c.execute(text("SELECT COUNT(*) FROM demo_login_attempts WHERE username=:key"), {"key": key}).scalar() or 0
        )
    if count >= LOGIN_MAX_FAILURES:
        raise HTTPException(429, "Too many failed sign-in attempts. Try again later.")


def login_throttle_record(key: str) -> None:
    with engine.begin() as c:
        c.execute(
            text("INSERT INTO demo_login_attempts VALUES (:id,:at,:key)"),
            {"id": secrets.token_hex(16), "at": utcnow().isoformat(), "key": key},
        )


def login_throttle_clear(key: str) -> None:
    with engine.begin() as c:
        c.execute(text("DELETE FROM demo_login_attempts WHERE username=:key"), {"key": key})


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def local_today() -> date:
    return utcnow().astimezone(LOCAL_TZ).date()


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def password_hash(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def iso_dt(day: date, hour: int, minute: int) -> str:
    return datetime.combine(day, time(hour, minute), tzinfo=LOCAL_TZ).astimezone(timezone.utc).isoformat()


def insert_user(c, user_id: str, name: str, role: str, password: str) -> None:
    salt = secrets.token_hex(16)
    c.execute(
        text("INSERT INTO demo_users VALUES (:id,:name,:role,:salt,:password)"),
        {"id": user_id, "name": name, "role": role, "salt": salt, "password": password_hash(password, salt)},
    )
