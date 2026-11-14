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
        # NOTE: demo_location_shifts is deliberately NOT created in this list - see
        # _ensure_location_shifts, called from _migrate_schema below.
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


LOCATION_SHIFTS_COLUMNS = ("id", "location_id", "label", "shift_start", "shift_end", "position")

# The exact PostgreSQL shape the app creates and is willing to reuse: column -> (udt, is_nullable).
_LOCATION_SHIFTS_PG_SHAPE = {
    "id": ("text", "NO"),
    "location_id": ("text", "NO"),
    "label": ("text", "YES"),
    "shift_start": ("text", "NO"),
    "shift_end": ("text", "NO"),
    "position": ("int4", "NO"),
}


def _location_shifts_shape_problems(c) -> list:
    """PostgreSQL only: every way a pre-existing shift table deviates from the contract.

    Checking names is not validation. A reusable table has exactly the expected columns
    with the expected types and nullability, a primary key on id, and no extra NOT NULL
    column without a default (an insert from this app would fail on one). Returns the
    list of problems found; empty means the table is safe to use.
    """
    rows = c.execute(
        text(
            "SELECT column_name, udt_name, is_nullable, column_default "
            "FROM information_schema.columns "
            "WHERE table_schema=current_schema() AND table_name='demo_location_shifts'"
        )
    ).mappings()
    cols = {r["column_name"]: r for r in rows}
    problems = []
    for name, (udt, nullable) in _LOCATION_SHIFTS_PG_SHAPE.items():
        col = cols.get(name)
        if col is None:
            problems.append(f"missing column {name}")
        elif col["udt_name"] != udt:
            problems.append(f"column {name} has type {col['udt_name']}, expected {udt}")
        elif col["is_nullable"] != nullable:
            problems.append(f"column {name} nullability is {col['is_nullable']}, expected {nullable}")
    for name in sorted(set(cols) - set(_LOCATION_SHIFTS_PG_SHAPE)):
        col = cols[name]
        if col["is_nullable"] == "NO" and col["column_default"] is None:
            problems.append(f"extra column {name} is NOT NULL without a default")
    pk = [
        r[0]
        for r in c.execute(
            text(
                "SELECT a.attname FROM pg_constraint con "
                "JOIN pg_class t ON t.oid = con.conrelid "
                "JOIN pg_namespace n ON n.oid = t.relnamespace "
                "JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(con.conkey) "
                "WHERE n.nspname=current_schema() AND t.relname='demo_location_shifts' "
                "AND con.contype='p' ORDER BY array_position(con.conkey, a.attnum)"
            )
        )
    ]
    if pk != ["id"]:
        problems.append(f"primary key is ({', '.join(pk)})" if pk else "no primary key")
    return problems


def _location_shifts_index_problem(c):
    """PostgreSQL only: (problem, enforced) for the (location_id, position) guarantee.

    A same-name index proves nothing: only a valid, non-partial UNIQUE index on exactly
    (location_id, position) of demo_location_shifts counts (any name is fine - an
    equivalent index under another name already enforces the rule). A same-name index
    with any other definition, or the name taken by an index on another table, is a
    conflict the boot must report instead of stepping around.
    """
    rows = c.execute(
        text(
            "SELECT cls.relname AS index_name, idx.indisunique AS unique, idx.indisvalid AS valid, "
            "idx.indpred IS NOT NULL AS partial, "
            "(SELECT array_agg(a.attname ORDER BY k.n) "
            "FROM unnest(idx.indkey) WITH ORDINALITY AS k(attnum, n) "
            "LEFT JOIN pg_attribute a ON a.attrelid=idx.indrelid AND a.attnum=k.attnum) AS cols "
            "FROM pg_index idx "
            "JOIN pg_class cls ON cls.oid=idx.indexrelid "
            "JOIN pg_class t ON t.oid=idx.indrelid "
            "JOIN pg_namespace n ON n.oid=t.relnamespace "
            "WHERE n.nspname=current_schema() AND t.relname='demo_location_shifts'"
        )
    ).mappings().all()

    def equivalent(r) -> bool:
        return bool(r["unique"] and r["valid"] and not r["partial"] and list(r["cols"]) == ["location_id", "position"])

    for r in rows:
        if r["index_name"] == "demo_location_shifts_loc_pos" and not equivalent(r):
            return (
                "index demo_location_shifts_loc_pos exists but is not a valid non-partial "
                "unique index on (location_id, position)",
                True,
            )
    if any(equivalent(r) for r in rows):
        return (None, True)
    collision = c.execute(
        text(
            "SELECT t.relname FROM pg_class cls "
            "JOIN pg_namespace n ON n.oid=cls.relnamespace "
            "JOIN pg_index idx ON idx.indexrelid=cls.oid "
            "JOIN pg_class t ON t.oid=idx.indrelid "
            "WHERE n.nspname=current_schema() AND cls.relname='demo_location_shifts_loc_pos' "
            "AND t.relname <> 'demo_location_shifts'"
        )
    ).first()
    if collision:
        return (
            f"an index named demo_location_shifts_loc_pos already exists on table {collision[0]}",
            False,
        )
    return (None, False)


def _ensure_location_shifts(c) -> None:
    """Create the shift-window table and its position index exactly once; validate shape.

    CREATE TABLE/INDEX IF NOT EXISTS takes a table-level lock (ShareLock for the index)
    on PostgreSQL even when the object already exists, and that lock can deadlock
    against an in-flight shift replacement holding the parent row lock. So existing
    objects are found through the catalog (no locks) and only actually created when
    missing. A pre-existing table or index that does not exactly match the contract
    stops the boot loudly and the whole boot transaction rolls back - foreign objects
    are never silently reused. (The deep shape check is PostgreSQL-only: SQLite demo
    databases are created by this app itself, so the column-name check suffices there.)
    """
    if engine.dialect.name == "sqlite":
        existing = _columns(c, "demo_location_shifts")
        if existing:
            missing = set(LOCATION_SHIFTS_COLUMNS) - set(existing)
            if missing:
                raise RuntimeError(
                    "demo_location_shifts exists with an incompatible shape "
                    f"(missing: {', '.join(sorted(missing))}); refusing to boot until it is reconciled. "
                    "No schema changes were made."
                )
        else:
            c.execute(
                text(
                    "CREATE TABLE demo_location_shifts (id TEXT PRIMARY KEY, location_id TEXT NOT NULL, label TEXT, shift_start TEXT NOT NULL, shift_end TEXT NOT NULL, position INTEGER NOT NULL)"
                )
            )
        have_index = c.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='index' AND name='demo_location_shifts_loc_pos'")
        ).first()
        if not have_index:
            c.execute(
                text(
                    "CREATE UNIQUE INDEX demo_location_shifts_loc_pos ON demo_location_shifts (location_id, position)"
                )
            )
        return
    # PostgreSQL: fail closed on any deviation, then create only what is missing.
    have_table = c.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema=current_schema() AND table_name='demo_location_shifts'"
        )
    ).first()
    if have_table:
        problems = _location_shifts_shape_problems(c)
        if problems:
            raise RuntimeError(
                "demo_location_shifts exists with an incompatible shape "
                f"({'; '.join(problems)}); refusing to boot until it is reconciled. "
                "No schema changes were made."
            )
    else:
        c.execute(
            text(
                "CREATE TABLE demo_location_shifts (id TEXT PRIMARY KEY, location_id TEXT NOT NULL, label TEXT, shift_start TEXT NOT NULL, shift_end TEXT NOT NULL, position INTEGER NOT NULL)"
            )
        )
    problem, enforced = _location_shifts_index_problem(c)
    if problem:
        raise RuntimeError(
            f"{problem}; refusing to boot until it is reconciled. No schema changes were made."
        )
    if not enforced:
        c.execute(
            text(
                "CREATE UNIQUE INDEX demo_location_shifts_loc_pos ON demo_location_shifts (location_id, position)"
            )
        )


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
    # Multiple shift timings per branch: copy the original single pair into the new table
    # for locations that predate it. Idempotent: a location that already has rows keeps them,
    # so repeat boots and concurrent starters (under the startup lock) apply this at most once.
    _ensure_location_shifts(c)
    if engine.dialect.name != "sqlite":
        # Serialize the backfill against in-flight API replacements: PUT /shifts locks the
        # parent location row first, so this waits for any open replacement and the
        # NOT EXISTS check below then reads its committed rows. (SQLite serializes the
        # whole write transaction instead.)
        c.execute(
            text("SELECT id FROM demo_locations WHERE shift_start IS NOT NULL AND shift_end IS NOT NULL FOR UPDATE")
        )
    c.execute(
        text(
            "INSERT INTO demo_location_shifts (id, location_id, label, shift_start, shift_end, position) "
            "SELECT l.id || '-shift-1', l.id, NULL, l.shift_start, l.shift_end, 0 FROM demo_locations l "
            "WHERE l.shift_start IS NOT NULL AND l.shift_end IS NOT NULL "
            "AND NOT EXISTS (SELECT 1 FROM demo_location_shifts s WHERE s.location_id = l.id)"
        )
    )


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
