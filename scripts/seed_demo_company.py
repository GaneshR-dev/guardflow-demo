"""Seed ONE clearly labelled fictional demo company with an admin, supervisors and three
completed calendar months of attendance. Never real records, never touches another company.

Usage (from the repo root; DATABASE_URL points at the target database):
  python scripts/seed_demo_company.py --dry-run                 # runs everything, then rolls back
  python scripts/seed_demo_company.py --apply --secrets-dir DIR # writes; passwords go to DIR/*.txt (0600)

Passwords are generated here, written only to files in --secrets-dir, and never printed or logged.
The script refuses to run twice (the company id already exists) and compares a fingerprint of
every existing company's rows before and after, aborting if anything outside the new company changed.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import secrets
import string
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from demo_db import engine, init_db  # noqa: E402
from demo_security import insert_user, iso_dt, local_today, utcnow  # noqa: E402
from sqlalchemy import text  # noqa: E402

COMPANY_ID = "co-demo-fictional"
COMPANY_NAME = "Demo Company (fictional sample data)"
LOCATIONS = [
    ("loc-demo-north", "Demo North Gate", "Fictional Road 1", "08:00", "16:00", 10),
    ("loc-demo-central", "Demo Central Office", "Fictional Road 2", "09:00", "18:00", 8),
    ("loc-demo-south", "Demo South Yard", "Fictional Road 3", "07:00", "19:00", 6),
]
SUPERVISORS = [("demo.sup.one", "Demo Supervisor One", ["loc-demo-north", "loc-demo-central"]), ("demo.sup.two", "Demo Supervisor Two", ["loc-demo-south"])]
ADMIN = ("demo.company.admin", "Demo Company Admin")


def completed_months(today: date, count: int = 3) -> list[tuple[date, date]]:
    """The last `count` full calendar months before the month containing today."""
    months, first = [], today.replace(day=1)
    for _ in range(count):
        last = first - timedelta(days=1)
        first = last.replace(day=1)
        months.append((first, last))
    return list(reversed(months))


def fingerprint(c) -> str:
    """Hash of every row that belongs to any company other than the demo one."""
    parts = []
    queries = [
        "SELECT id,name,role,salt,password,company_id FROM demo_users WHERE COALESCE(company_id,'')<>:demo ORDER BY id",
        "SELECT id,name,area,assigned_count,shift_start,shift_end,active,company_id FROM demo_locations WHERE COALESCE(company_id,'')<>:demo ORDER BY id",
        "SELECT id,name,phone,role,location_id,active,company_id FROM demo_employees WHERE COALESCE(company_id,'')<>:demo ORDER BY id",
        "SELECT a.id,a.employee_id,a.location_id,a.day,a.status,a.check_in,a.check_out,a.source FROM demo_attendance a "
        "JOIN demo_locations l ON l.id=a.location_id WHERE COALESCE(l.company_id,'')<>:demo ORDER BY a.id",
        "SELECT id,at,user_id,action,details FROM demo_audit ORDER BY id",
        "SELECT id,name,active FROM demo_companies WHERE id<>:demo ORDER BY id",
    ]
    for q in queries:
        rows = c.execute(text(q), {"demo": COMPANY_ID}).all()
        parts.append(f"{len(rows)}:" + hashlib.sha256(repr([tuple(r) for r in rows]).encode()).hexdigest())
    return "|".join(parts)


def new_password() -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        value = secrets.choice(string.ascii_letters) + "".join(secrets.choice(alphabet) for _ in range(17))
        if any(ch.islower() for ch in value) and any(ch.isupper() for ch in value) and any(ch.isdigit() for ch in value):
            return value


def seed(c, secrets_dir: str | None) -> dict:
    if c.execute(text("SELECT 1 FROM demo_companies WHERE id=:id"), {"id": COMPANY_ID}).first():
        raise SystemExit("Demo company already exists; refusing to seed twice.")
    c.execute(
        text("INSERT INTO demo_companies (id,name,active,created_at,created_by) VALUES (:id,:name,1,:at,'demo-seed')"),
        {"id": COMPANY_ID, "name": COMPANY_NAME, "at": utcnow().isoformat()},
    )
    for lid, name, area, start, end, count in LOCATIONS:
        c.execute(
            text("INSERT INTO demo_locations (id,name,area,assigned_count,shift_start,shift_end,active,company_id) VALUES (:id,:name,:area,:count,:s,:e,1,:co)"),
            {"id": lid, "name": name, "area": area, "count": count, "s": start, "e": end, "co": COMPANY_ID},
        )
        c.execute(
            text("INSERT INTO demo_location_shifts (id,location_id,label,shift_start,shift_end,position) VALUES (:id,:loc,'Day',:s,:e,0)"),
            {"id": f"{lid}-shift-1-demo", "loc": lid, "s": start, "e": end},
        )
    written = []
    people = [(ADMIN[0], ADMIN[1], "admin", [])] + [(u, n, "supervisor", locs) for u, n, locs in SUPERVISORS]
    for uid, name, role, locs in people:
        password = new_password()
        insert_user(c, uid, name, role, password, COMPANY_ID)
        for lid in locs:
            c.execute(text("INSERT INTO demo_user_locations VALUES (:u,:l)"), {"u": uid, "l": lid})
        if secrets_dir:
            path = os.path.join(secrets_dir, f"{uid}.txt")
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as fh:
                fh.write(password + "\n")
            written.append(uid)
    employees = []
    for lid, _n, _a, _s, _e, count in LOCATIONS:
        for i in range(count):
            eid = f"DEMO-{lid.split('-')[-1][:1].upper()}{i + 1:02d}"
            employees.append((eid, f"Demo Guard {eid[-3:]}", f"+00 00000 {len(employees):05d}", "Guard", lid))
    for eid, name, phone, role, lid in employees:
        c.execute(
            text("INSERT INTO demo_employees (id,name,phone,role,location_id,active,company_id) VALUES (:id,:n,:p,:r,:l,1,:co)"),
            {"id": eid, "n": name, "p": phone, "r": role, "l": lid, "co": COMPANY_ID},
        )
    months = completed_months(local_today())
    rows = 0
    for first, last in months:
        day = first
        while day <= last:
            for index, (eid, _n, _p, _r, lid) in enumerate(employees):
                if ((index * 13 + day.day * 7 + day.month * 3) % 100) >= 90 or day.weekday() == 6:
                    continue  # fictional absences and Sundays off
                c.execute(
                    text("INSERT INTO demo_attendance VALUES (:id,:e,:l,:d,'completed',:cin,:cout,'fictional demo company history')"),
                    {
                        "id": f"att-{eid}-{day.isoformat()}",
                        "e": eid,
                        "l": lid,
                        "d": day.isoformat(),
                        "cin": iso_dt(day, 8 + (index + day.day) % 2, (index * 7 + day.day * 3) % 60),
                        "cout": iso_dt(day, 17 + (index + day.month) % 2, (index * 11 + day.day) % 60),
                    },
                )
                rows += 1
            day += timedelta(days=1)
    return {"locations": len(LOCATIONS), "employees": len(employees), "attendance_rows": rows, "months": [f"{a:%Y-%m}" for a, _ in months], "passwords_written_for": written}


def main() -> None:
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    ap.add_argument("--secrets-dir")
    args = ap.parse_args()
    if args.apply and not args.secrets_dir:
        raise SystemExit("--apply needs --secrets-dir so the generated passwords have somewhere to go")
    if args.secrets_dir:
        os.makedirs(args.secrets_dir, exist_ok=True)
    init_db()
    with engine.connect() as c:
        before = fingerprint(c)
    with engine.connect() as c:
        tx = c.begin()
        summary = seed(c, args.secrets_dir)
        after = fingerprint(c)
        if before != after:
            tx.rollback()
            raise SystemExit("ABORT: rows outside the demo company changed; rolled back.")
        if args.apply:
            tx.commit()
        else:
            tx.rollback()
    print({"mode": "apply" if args.apply else "dry-run (rolled back)", **summary, "existing_rows_unchanged": True})


if __name__ == "__main__":
    main()
