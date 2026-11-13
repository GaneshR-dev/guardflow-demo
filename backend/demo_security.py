"""Authentication helpers for the Guardian attendance demo API: password hashing, session token digests and login throttling."""
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import date, datetime, time, timezone

from fastapi import HTTPException
from sqlalchemy import text

from demo_db import LOCAL_TZ

LOGIN_MAX_FAILURES = int(os.environ.get("LOGIN_MAX_FAILURES", "5"))
LOGIN_LOCK_SECONDS = int(os.environ.get("LOGIN_LOCK_SECONDS", "900"))
_login_failures: dict[str, list[float]] = {}


def login_throttle_check(key: str) -> None:
    now = utcnow().timestamp()
    attempts = [t for t in _login_failures.get(key, []) if now - t < LOGIN_LOCK_SECONDS]
    _login_failures[key] = attempts
    if len(attempts) >= LOGIN_MAX_FAILURES:
        raise HTTPException(429, "Too many failed sign-in attempts. Try again later.")


def login_throttle_record(key: str) -> None:
    _login_failures.setdefault(key, []).append(utcnow().timestamp())


def login_throttle_clear(key: str) -> None:
    _login_failures.pop(key, None)


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
