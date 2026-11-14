"""Database engine, configuration and schema for the Guardian attendance demo API."""

from __future__ import annotations

import os
import time
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
LOCAL_TZ = ZoneInfo(os.environ.get("APP_TIMEZONE", "Asia/Kolkata"))
DB_URL = os.environ.get("DATABASE_URL", "sqlite:///./guardflow-demo.db")
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+psycopg://", 1)
engine_kwargs = {"connect_args": {"check_same_thread": False}} if DB_URL.startswith("sqlite") else {}
if DB_URL.startswith("sqlite") and ":memory:" in DB_URL:
    engine_kwargs["poolclass"] = StaticPool
engine = create_engine(DB_URL, **engine_kwargs)
DEMO_MODE = os.environ.get("DEMO_MODE", "true" if DB_URL.startswith("sqlite") else "false").lower() == "true"


def init_db() -> None:
    statements = [
        "CREATE TABLE IF NOT EXISTS demo_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS demo_user_locations (user_id TEXT NOT NULL, location_id TEXT NOT NULL, PRIMARY KEY (user_id, location_id))",
        "CREATE TABLE IF NOT EXISTS demo_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS demo_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, assigned_count INTEGER NOT NULL, shift_start TEXT, shift_end TEXT, active INTEGER NOT NULL DEFAULT 1)",
        "CREATE TABLE IF NOT EXISTS demo_employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, role TEXT NOT NULL, location_id TEXT, active INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS demo_attendance (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, location_id TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, check_in TEXT, check_out TEXT, source TEXT NOT NULL, UNIQUE(employee_id, day))",
        "CREATE TABLE IF NOT EXISTS demo_audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS demo_login_attempts (id TEXT PRIMARY KEY, at TEXT NOT NULL, username TEXT NOT NULL)",
    ]
    if engine.dialect.name == "sqlite":
        with engine.begin() as c:
            _acquire_sqlite_startup_lock(c)
            for statement in statements:
                c.execute(text(statement))
            _migrate_schema(c)
        return
    with engine.begin() as c:
        _acquire_pg_startup_lock(c)
        for statement in statements:
            c.execute(text(statement))
        _migrate_schema(c)


def _columns(c, table: str) -> dict:
    """Column name -> nullable flag for one table, on either supported database."""
    if engine.dialect.name == "sqlite":
        return {row[1]: not row[3] for row in c.execute(text(f"PRAGMA table_info({table})"))}
    rows = c.execute(
        text(
            "SELECT column_name, is_nullable FROM information_schema.columns "
            "WHERE table_name=:table AND table_schema=current_schema()"
        ),
        {"table": table},
    )
    return {row[0]: row[1] == "YES" for row in rows}


MIGRATION_LOCK_KEY = 84520131  # advisory-lock key serializing concurrent startup migrations


def _acquire_sqlite_startup_lock(c) -> None:
    """Serialize concurrent starters on SQLite: the write takes the DB write lock immediately."""
    c.execute(text("CREATE TABLE IF NOT EXISTS demo_migration_lock (id INTEGER PRIMARY KEY, started TEXT)"))
    c.execute(text("INSERT OR REPLACE INTO demo_migration_lock (id, started) VALUES (1, 'startup')"))


def _acquire_pg_startup_lock(c) -> None:
    """Serialize concurrent starters on PostgreSQL with a bounded wait and a loud, safe failure.

    Transaction-scoped advisory lock: released automatically by commit or rollback, so a failed
    startup can never strand a lock on a pooled connection. Also bounds the DDL wait on
    ordinary readers/writers via lock_timeout, so a blocked startup cannot queue-stall the app.
    """
    acquired = False
    for _ in range(30):  # bounded: about 15 seconds
        if c.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": MIGRATION_LOCK_KEY}).scalar():
            acquired = True
            break
        time.sleep(0.5)
    if not acquired:
        raise RuntimeError(
            "Could not acquire the database migration lock within about 15 seconds. "
            "Another instance may still be migrating; retry startup. No schema changes were made."
        )
    c.execute(text("SET LOCAL lock_timeout = '10s'"))
    c.execute(text("SET LOCAL statement_timeout = '60s'"))


def _migrate_schema(c) -> None:
    """The actual schema steps; each is a no-op once applied. Runs inside one transaction."""
    location_columns = _columns(c, "demo_locations")
    for column in ("shift_start", "shift_end"):
        if column not in location_columns:
            c.execute(text(f"ALTER TABLE demo_locations ADD COLUMN {column} TEXT"))
    if "active" not in location_columns:
        c.execute(text("ALTER TABLE demo_locations ADD COLUMN active INTEGER NOT NULL DEFAULT 1"))
    employee_columns = _columns(c, "demo_employees")
    if employee_columns.get("location_id") is False:
        # location_id became optional: unassigned employees are added first and placed later.
        if engine.dialect.name == "sqlite":
            # SQLite cannot relax a NOT NULL column in place, so rebuild the table.
            c.execute(
                text(
                    "CREATE TABLE demo_employees_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, role TEXT NOT NULL, location_id TEXT, active INTEGER NOT NULL)"
                )
            )
            c.execute(
                text("INSERT INTO demo_employees_new SELECT id,name,phone,role,location_id,active FROM demo_employees")
            )
            c.execute(text("DROP TABLE demo_employees"))
            c.execute(text("ALTER TABLE demo_employees_new RENAME TO demo_employees"))
        else:
            c.execute(text("ALTER TABLE demo_employees ALTER COLUMN location_id DROP NOT NULL"))


def migrate_db() -> None:
    """Bring pre-feature databases forward: location shifts/soft delete and optional employee location.

    Standalone entry (used by tests); startup goes through init_db, which holds the same guard
    around the CREATE TABLE statements as well, so the whole boot sequence is serialized.
    """
    if engine.dialect.name == "sqlite":
        with engine.begin() as c:
            _acquire_sqlite_startup_lock(c)
            _migrate_schema(c)
        return
    with engine.begin() as c:
        _acquire_pg_startup_lock(c)
        _migrate_schema(c)
