"""Guardflow Figma demo API.

FastAPI + SQLAlchemy, SQLite for local development and PostgreSQL through
DATABASE_URL for the approved office-PC/Cloudflare Tunnel deployment plan.
The seed data is fictional sample history for the demo, never real business records.
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import os
import secrets
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
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
API_DOCS_ENABLED = os.environ.get("API_DOCS", "true").lower() == "true"
app = FastAPI(
    title="Guardflow Figma Demo API",
    version="0.3.0",
    docs_url="/docs" if API_DOCS_ENABLED else None,
    redoc_url="/redoc" if API_DOCS_ENABLED else None,
    openapi_url="/openapi.json" if API_DOCS_ENABLED else None,
)
DEMO_MODE = os.environ.get("DEMO_MODE", "true" if DB_URL.startswith("sqlite") else "false").lower() == "true"
bearer = HTTPBearer(auto_error=False)


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


def init_db() -> None:
    statements = [
        "CREATE TABLE IF NOT EXISTS demo_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS demo_user_locations (user_id TEXT NOT NULL, location_id TEXT NOT NULL, PRIMARY KEY (user_id, location_id))",
        "CREATE TABLE IF NOT EXISTS demo_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS demo_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, assigned_count INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS demo_employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, role TEXT NOT NULL, location_id TEXT NOT NULL, active INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS demo_attendance (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, location_id TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, check_in TEXT, check_out TEXT, source TEXT NOT NULL, UNIQUE(employee_id, day))",
        "CREATE TABLE IF NOT EXISTS demo_audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL)",
    ]
    with engine.begin() as c:
        for statement in statements:
            c.execute(text(statement))


def insert_user(c, user_id: str, name: str, role: str, password: str) -> None:
    salt = secrets.token_hex(16)
    c.execute(
        text("INSERT INTO demo_users VALUES (:id,:name,:role,:salt,:password)"),
        {"id": user_id, "name": name, "role": role, "salt": salt, "password": password_hash(password, salt)},
    )


def seed_demo() -> None:
    """Seed clearly fictional sample history across the last six calendar months."""
    with engine.begin() as c:
        if c.execute(text("SELECT COUNT(*) FROM demo_users")).scalar():
            return
        insert_user(c, "admin.demo", "Admin Demo", "admin", "demo123")
        insert_user(c, "supervisor.demo", "Supervisor Demo", "supervisor", "demo123")
        insert_user(c, "demo", "Demo Supervisor", "supervisor", "demo123")
        locations = [
            ("loc-hsr", "Bengaluru - HSR Layout", "HSR Sector 2", 24),
            ("loc-whitefield", "Bengaluru - Whitefield", "ITPL Main Road", 18),
            ("loc-mysuru", "Mysuru - City Centre", "Devaraja Mohalla", 12),
        ]
        for row in locations:
            c.execute(text("INSERT INTO demo_locations VALUES (:id,:name,:area,:count)"), {"id": row[0], "name": row[1], "area": row[2], "count": row[3]})
        employees = [
            ("EMP1024", "Deepak Kumar", "+91 90000 11024", "Senior Guard", "loc-hsr"),
            ("EMP1031", "Ananya Rao", "+91 90000 11031", "Guard", "loc-hsr"),
            ("EMP1042", "Rohan K", "+91 90000 11042", "Guard", "loc-hsr"),
            ("EMP1048", "Sneha P", "+91 90000 11048", "Guard", "loc-hsr"),
            ("EMP1051", "Vikram P", "+91 90000 11051", "Guard", "loc-hsr"),
            ("EMP1052", "Meera Shah", "+91 90000 11052", "Guard", "loc-hsr"),
            ("EMP1053", "Arjun Verma", "+91 90000 11053", "Guard", "loc-hsr"),
            ("EMP1054", "Kiran S", "+91 90000 11054", "Guard", "loc-hsr"),
            ("EMP1055", "Naveen R", "+91 90000 11055", "Guard", "loc-hsr"),
            ("EMP1056", "Priya N", "+91 90000 11056", "Guard", "loc-hsr"),
            ("EMP1057", "Suresh M", "+91 90000 11057", "Guard", "loc-hsr"),
            ("EMP1058", "Divya L", "+91 90000 11058", "Guard", "loc-hsr"),
            ("EMP1059", "Manoj T", "+91 90000 11059", "Guard", "loc-hsr"),
            ("EMP1060", "Asha V", "+91 90000 11060", "Guard", "loc-hsr"),
            ("EMP1061", "Ravi B", "+91 90000 11061", "Guard", "loc-hsr"),
            ("EMP1062", "Pooja H", "+91 90000 11062", "Guard", "loc-hsr"),
            ("EMP1063", "Imran A", "+91 90000 11063", "Guard", "loc-hsr"),
            ("EMP1064", "Nisha D", "+91 90000 11064", "Guard", "loc-hsr"),
            ("EMP1065", "Tarun J", "+91 90000 11065", "Guard", "loc-hsr"),
            ("EMP1066", "Latha G", "+91 90000 11066", "Guard", "loc-hsr"),
            ("EMP1067", "Vivek N", "+91 90000 11067", "Guard", "loc-hsr"),
            ("EMP1068", "Sana F", "+91 90000 11068", "Guard", "loc-hsr"),
            ("EMP1069", "Harish Q", "+91 90000 11069", "Guard", "loc-hsr"),
            ("EMP1070", "Geeta W", "+91 90000 11070", "Guard", "loc-hsr"),
            ("EMP2001", "Mahesh R", "+91 90000 12001", "Guard", "loc-whitefield"),
            ("EMP2002", "Ritika S", "+91 90000 12002", "Guard", "loc-whitefield"),
            ("EMP2003", "Farhan M", "+91 90000 12003", "Guard", "loc-whitefield"),
            ("EMP2004", "Kavya B", "+91 90000 12004", "Guard", "loc-whitefield"),
            ("EMP2005", "Ramesh K", "+91 90000 12005", "Guard", "loc-whitefield"),
            ("EMP2006", "Jyoti P", "+91 90000 12006", "Guard", "loc-whitefield"),
            ("EMP2007", "Santosh E", "+91 90000 12007", "Guard", "loc-whitefield"),
            ("EMP2008", "Ammu C", "+91 90000 12008", "Guard", "loc-whitefield"),
            ("EMP2009", "Prakash V", "+91 90000 12009", "Guard", "loc-whitefield"),
            ("EMP2010", "Bindu N", "+91 90000 12010", "Guard", "loc-whitefield"),
            ("EMP2011", "Sharath U", "+91 90000 12011", "Guard", "loc-whitefield"),
            ("EMP2012", "Keerthi Z", "+91 90000 12012", "Guard", "loc-whitefield"),
            ("EMP2013", "Yusuf L", "+91 90000 12013", "Guard", "loc-whitefield"),
            ("EMP2014", "Anita M", "+91 90000 12014", "Guard", "loc-whitefield"),
            ("EMP2015", "Chandra T", "+91 90000 12015", "Guard", "loc-whitefield"),
            ("EMP2016", "Bhavana K", "+91 90000 12016", "Guard", "loc-whitefield"),
            ("EMP2017", "Girish O", "+91 90000 12017", "Guard", "loc-whitefield"),
            ("EMP2018", "Sowmya I", "+91 90000 12018", "Guard", "loc-whitefield"),
            ("EMP3001", "Akash P", "+91 90000 13001", "Guard", "loc-mysuru"),
            ("EMP3002", "Meghana R", "+91 90000 13002", "Guard", "loc-mysuru"),
            ("EMP3003", "Vinod S", "+91 90000 13003", "Guard", "loc-mysuru"),
            ("EMP3004", "Shalini D", "+91 90000 13004", "Guard", "loc-mysuru"),
            ("EMP3005", "Rahul G", "+91 90000 13005", "Guard", "loc-mysuru"),
            ("EMP3006", "Padma N", "+91 90000 13006", "Guard", "loc-mysuru"),
            ("EMP3007", "Nithin J", "+91 90000 13007", "Guard", "loc-mysuru"),
            ("EMP3008", "Anu B", "+91 90000 13008", "Guard", "loc-mysuru"),
            ("EMP3009", "Karthik H", "+91 90000 13009", "Guard", "loc-mysuru"),
            ("EMP3010", "Rashmi F", "+91 90000 13010", "Guard", "loc-mysuru"),
            ("EMP3011", "Sunil A", "+91 90000 13011", "Guard", "loc-mysuru"),
            ("EMP3012", "Veena K", "+91 90000 13012", "Guard", "loc-mysuru"),
        ]
        for emp in employees:
            c.execute(
                text("INSERT INTO demo_employees VALUES (:id,:name,:phone,:role,:location,1)"),
                {"id": emp[0], "name": emp[1], "phone": emp[2], "role": emp[3], "location": emp[4]},
            )
        today = local_today()
        first_day = today - timedelta(days=182)
        for offset in range(183):
            day = first_day + timedelta(days=offset)
            if day == today:
                continue
            for index, emp in enumerate(employees):
                # Deterministic fictional pattern: about 88% attendance with monthly variation.
                present = ((index * 17 + day.day * 11 + day.month * 5) % 100) < 88
                if not present:
                    continue
                check_hour = 8 + ((index + day.day) % 3)
                check_min = (index * 7 + day.day * 3) % 60
                out_hour = 17 + ((index + day.month) % 3)
                out_min = (index * 11 + day.day) % 60
                c.execute(
                    text("INSERT INTO demo_attendance VALUES (:id,:employee,:location,:day,:status,:cin,:cout,:source)"),
                    {
                        "id": f"att-{emp[0]}-{day.isoformat()}",
                        "employee": emp[0],
                        "location": emp[4],
                        "day": day.isoformat(),
                        "status": "completed",
                        "cin": iso_dt(day, check_hour, check_min),
                        "cout": iso_dt(day, out_hour, out_min),
                        "source": "fictional sample history",
                    },
                )
        # Today mirrors the design's HSR counts: 16 checked in, 5 not in, 3 completed.
        hsr = [e for e in employees if e[4] == "loc-hsr"]
        for index, emp in enumerate(hsr):
            if index < 16:
                status, cout = "checked_in", None
            elif index < 19:
                status, cout = "completed", iso_dt(today, 17, 20 + index)
            else:
                status, cout = "not_in", None
            cin = None if status == "not_in" else iso_dt(today, 8, 40 + (index % 12))
            c.execute(
                text("INSERT INTO demo_attendance VALUES (:id,:employee,:location,:day,:status,:cin,:cout,:source)"),
                {
                    "id": f"att-{emp[0]}-{today.isoformat()}",
                    "employee": emp[0],
                    "location": emp[4],
                    "day": today.isoformat(),
                    "status": status,
                    "cin": cin,
                    "cout": cout,
                    "source": "fictional sample history",
                },
            )


init_db()
if DEMO_MODE:
    seed_demo()


def seed_access() -> None:
    """Assign demo supervisors to a subset of locations; admins see all."""
    if not DEMO_MODE:
        return
    with engine.begin() as c:
        if c.execute(text("SELECT COUNT(*) FROM demo_user_locations")).scalar():
            return
        for user_id, location_id in [
            ("supervisor.demo", "loc-hsr"),
            ("supervisor.demo", "loc-whitefield"),
            ("demo", "loc-hsr"),
        ]:
            c.execute(text("INSERT INTO demo_user_locations VALUES (:user,:location)"), {"user": user_id, "location": location_id})


seed_access()


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=100)


class CheckBody(BaseModel):
    employee_id: str = Field(min_length=2, max_length=40)
    location_id: str = Field(min_length=2, max_length=40)


class EmployeeBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=25, pattern=r"^[0-9+() -]+$")
    role: str = Field(default="Guard", max_length=40)
    location_id: str = Field(min_length=2, max_length=40)

    @field_validator("role")
    @classmethod
    def role_allowed(cls, value: str) -> str:
        allowed = {"Guard", "Senior Guard", "Supervisor"}
        if value not in allowed:
            raise ValueError("Role must be Guard, Senior Guard or Supervisor")
        return value


class EmployeeImportRow(EmployeeBody):
    id: str | None = Field(default=None, max_length=40)


class EmployeeImportBody(BaseModel):
    rows: list[EmployeeImportRow] = Field(min_length=1, max_length=500)


class ProfileBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class LocationBody(BaseModel):
    id: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=3, max_length=100)
    area: str = Field(min_length=2, max_length=100)
    assigned_count: int = Field(default=0, ge=0, le=10000)


class AccessBody(BaseModel):
    id: str = Field(min_length=3, max_length=80)
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=12, max_length=100)
    role: str = Field(pattern="^(admin|supervisor)$")
    location_ids: list[str] = Field(default_factory=list, max_length=50)


@app.post("/api/login")
def login(body: LoginBody):
    with engine.begin() as c:
        row = c.execute(text("SELECT * FROM demo_users WHERE id=:id"), {"id": body.username}).mappings().first()
        if not row or not hmac.compare_digest(password_hash(body.password, row["salt"]), row["password"]):
            raise HTTPException(401, "Invalid user ID or password")
        token = secrets.token_urlsafe(32)
        c.execute(
            text("INSERT INTO demo_sessions VALUES (:token,:user,:expires)"),
            {"token": token_digest(token), "user": row["id"], "expires": (utcnow() + timedelta(hours=10)).isoformat()},
        )
        return {"token": token, "user": {"id": row["id"], "name": row["name"], "role": row["role"]}}


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        raise HTTPException(401, "Sign in required")
    with engine.connect() as c:
        row = c.execute(
            text("SELECT u.id,u.name,u.role,s.expires FROM demo_sessions s JOIN demo_users u ON u.id=s.user_id WHERE s.token=:token"),
            {"token": token_digest(credentials.credentials)},
        ).mappings().first()
    if not row or datetime.fromisoformat(row["expires"]) < utcnow():
        raise HTTPException(401, "Session expired")
    return dict(row)


def audit(c, user, action: str, details: dict) -> None:
    c.execute(
        text("INSERT INTO demo_audit VALUES (:id,:at,:user,:action,:details)"),
        {"id": secrets.token_hex(16), "at": utcnow().isoformat(), "user": user["id"], "action": action, "details": json.dumps(details)},
    )


def location_rows(user):
    with engine.connect() as c:
        if user["role"] == "admin":
            return [dict(r) for r in c.execute(text("SELECT * FROM demo_locations ORDER BY name")).mappings()]
        return [dict(r) for r in c.execute(
            text("SELECT l.* FROM demo_locations l JOIN demo_user_locations a ON a.location_id=l.id WHERE a.user_id=:user ORDER BY l.name"),
            {"user": user["id"]},
        ).mappings()]


def scoped_sql(user: dict, column: str) -> str:
    if user["role"] == "admin":
        return "1=1"
    return f"{column} IN (SELECT location_id FROM demo_user_locations WHERE user_id=:__scope_user)"


def scope_params(user: dict) -> dict:
    return {} if user["role"] == "admin" else {"__scope_user": user["id"]}


def require_location_access(c, user: dict, location_id: str):
    row = c.execute(text("SELECT * FROM demo_locations WHERE id=:id"), {"id": location_id}).mappings().first()
    if not row:
        raise HTTPException(404, "Location not found")
    if user["role"] != "admin" and not c.execute(
        text("SELECT 1 FROM demo_user_locations WHERE user_id=:user AND location_id=:location"),
        {"user": user["id"], "location": location_id},
    ).first():
        raise HTTPException(403, "No access to this location")
    return row


def require_role_write(user: dict, role: str) -> None:
    if user["role"] != "admin" and role == "Supervisor":
        raise HTTPException(403, "Only admins can create or import supervisors")


def worked_hours(check_in: str | None, check_out: str | None) -> float | None:
    if not check_in or not check_out:
        return None
    start = datetime.fromisoformat(check_in)
    end = datetime.fromisoformat(check_out)
    if end <= start:
        return None
    return round((end - start).total_seconds() / 3600, 2)


def attendance_summary(location_id: str, day: date) -> dict:
    with engine.connect() as c:
        rows = c.execute(
            text("SELECT status,COUNT(*) count FROM demo_attendance WHERE location_id=:location AND day=:day GROUP BY status"),
            {"location": location_id, "day": day.isoformat()},
        ).mappings().all()
    counts = {"checked_in": 0, "completed": 0, "not_in": 0}
    counts.update({r["status"]: r["count"] for r in rows})
    return counts


@app.get("/api/health")
def health():
    return {"status": "ok", "data_notice": "Fictional sample data only", "database": "postgresql" if DB_URL.startswith("postgres") else "sqlite"}


@app.get("/api/locations")
def locations(user=Depends(current_user)):
    return location_rows(user)


@app.get("/api/employees")
def employees(location_id: str | None = None, q: str = "", user=Depends(current_user)):
    sql = "SELECT * FROM demo_employees WHERE active=1 AND " + scoped_sql(user, "location_id")
    params = scope_params(user)
    with engine.connect() as c:
        if location_id:
            require_location_access(c, user, location_id)
            sql += " AND location_id=:location"; params["location"] = location_id
        if q:
            sql += " AND (lower(name) LIKE :q OR lower(id) LIKE :q)"; params["q"] = f"%{q.lower()}%"
        sql += " ORDER BY name"
        return [dict(r) for r in c.execute(text(sql), params).mappings()]


@app.post("/api/employees")
def add_employee(body: EmployeeBody, user=Depends(current_user)):
    if user["role"] not in ("admin", "supervisor"):
        raise HTTPException(403, "Admin or supervisor required")
    require_role_write(user, body.role)
    with engine.begin() as c:
        require_location_access(c, user, body.location_id)
        count = int(c.execute(text("SELECT COUNT(*) FROM demo_employees")).scalar() or 0)
        while True:
            employee_id = f"EMP{4000 + count + 1}"
            if not c.execute(text("SELECT 1 FROM demo_employees WHERE id=:id"), {"id": employee_id}).first():
                break
            count += 1
        c.execute(
            text("INSERT INTO demo_employees VALUES (:id,:name,:phone,:role,:location,1)"),
            {"id": employee_id, "name": body.name, "phone": body.phone, "role": body.role, "location": body.location_id},
        )
        c.execute(text("UPDATE demo_locations SET assigned_count=assigned_count+1 WHERE id=:id"), {"id": body.location_id})
        audit(c, user, "employee.create", {"employee_id": employee_id, "location_id": body.location_id})
        return {"id": employee_id, "name": body.name, "phone": body.phone, "role": body.role, "location_id": body.location_id}


@app.post("/api/employees/import")
def import_employees(body: EmployeeImportBody, user=Depends(current_user)):
    if user["role"] not in ("admin", "supervisor"):
        raise HTTPException(403, "Admin or supervisor required")
    explicit_ids = [row.id for row in body.rows if row.id]
    duplicates = sorted({employee_id for employee_id in explicit_ids if explicit_ids.count(employee_id) > 1})
    if duplicates:
        raise HTTPException(400, "Duplicate employee IDs in import: " + ", ".join(duplicates))
    created = updated = 0
    with engine.begin() as c:
        next_count = int(c.execute(text("SELECT COUNT(*) FROM demo_employees")).scalar() or 0)
        for row in body.rows:
            require_role_write(user, row.role)
            require_location_access(c, user, row.location_id)
            employee_id = row.id
            if not employee_id:
                while True:
                    candidate = f"EMP{4000 + next_count + 1}"
                    next_count += 1
                    if not c.execute(text("SELECT 1 FROM demo_employees WHERE id=:id"), {"id": candidate}).first():
                        employee_id = candidate
                        break
            existing = c.execute(text("SELECT * FROM demo_employees WHERE id=:id"), {"id": employee_id}).mappings().first()
            if existing:
                require_location_access(c, user, existing["location_id"])
                c.execute(text("UPDATE demo_employees SET name=:name,phone=:phone,role=:role,location_id=:location,active=1 WHERE id=:id"), {"id": employee_id, "name": row.name, "phone": row.phone, "role": row.role, "location": row.location_id})
                updated += 1
            else:
                c.execute(text("INSERT INTO demo_employees VALUES (:id,:name,:phone,:role,:location,1)"), {"id": employee_id, "name": row.name, "phone": row.phone, "role": row.role, "location": row.location_id})
                c.execute(text("UPDATE demo_locations SET assigned_count=assigned_count+1 WHERE id=:id"), {"id": row.location_id})
                created += 1
        audit(c, user, "employee.import", {"created": created, "updated": updated})
    return {"created": created, "updated": updated}


@app.get("/api/attendance")
def attendance(location_id: str, day: str | None = None, q: str = "", status: str = "", user=Depends(current_user)):
    selected_day = day or local_today().isoformat()
    sql = """
      SELECT a.*,e.name,e.phone,e.role FROM demo_attendance a
      JOIN demo_employees e ON e.id=a.employee_id
      WHERE a.location_id=:location AND a.day=:day
    """
    params = {"location": location_id, "day": selected_day}
    if q:
        sql += " AND (lower(e.name) LIKE :q OR lower(e.id) LIKE :q)"; params["q"] = f"%{q.lower()}%"
    if status:
        sql += " AND a.status=:status"; params["status"] = status
    sql += " ORDER BY e.name"
    with engine.connect() as c:
        require_location_access(c, user, location_id)
        rows = [dict(r) for r in c.execute(text(sql), params).mappings()]
    return {"day": selected_day, "summary": attendance_summary(location_id, date.fromisoformat(selected_day)), "rows": rows}


@app.post("/api/attendance/checkin")
def check_in(body: CheckBody, user=Depends(current_user)):
    today = local_today().isoformat()
    stamp = utcnow().isoformat()
    with engine.begin() as c:
        emp = c.execute(text("SELECT * FROM demo_employees WHERE id=:id AND active=1"), {"id": body.employee_id}).mappings().first()
        if not emp:
            raise HTTPException(404, "Employee not found")
        if emp["location_id"] != body.location_id:
            raise HTTPException(409, "Employee is assigned to another location")
        require_location_access(c, user, body.location_id)
        existing = c.execute(text("SELECT * FROM demo_attendance WHERE employee_id=:employee AND day=:day"), {"employee": body.employee_id, "day": today}).mappings().first()
        if existing and existing["status"] in ("checked_in", "completed"):
            raise HTTPException(409, "Employee is already checked in")
        if existing:
            c.execute(text("UPDATE demo_attendance SET status='checked_in',check_in=:stamp,check_out=NULL,source='live demo' WHERE id=:id"), {"stamp": stamp, "id": existing["id"]})
        else:
            c.execute(
                text("INSERT INTO demo_attendance VALUES (:id,:employee,:location,:day,'checked_in',:cin,NULL,'live demo')"),
                {"id": secrets.token_hex(12), "employee": body.employee_id, "location": body.location_id, "day": today, "cin": stamp},
            )
        audit(c, user, "attendance.checkin", body.model_dump())
        return {"employee_id": body.employee_id, "name": emp["name"], "status": "checked_in", "check_in": stamp}


@app.post("/api/attendance/checkout")
def check_out(body: CheckBody, user=Depends(current_user)):
    today = local_today().isoformat()
    stamp = utcnow().isoformat()
    with engine.begin() as c:
        require_location_access(c, user, body.location_id)
        row = c.execute(text("SELECT a.*,e.name FROM demo_attendance a JOIN demo_employees e ON e.id=a.employee_id WHERE a.employee_id=:employee AND a.day=:day AND a.location_id=:location"), {"employee": body.employee_id, "day": today, "location": body.location_id}).mappings().first()
        if not row or row["status"] != "checked_in":
            raise HTTPException(409, "Employee is not currently checked in")
        c.execute(text("UPDATE demo_attendance SET status='completed',check_out=:stamp,source='live demo' WHERE id=:id"), {"stamp": stamp, "id": row["id"]})
        audit(c, user, "attendance.checkout", body.model_dump())
        return {"employee_id": body.employee_id, "name": row["name"], "status": "completed", "check_out": stamp}


@app.get("/api/dashboard")
def dashboard(user=Depends(current_user)):
    today = local_today().isoformat()
    scope = scoped_sql(user, "location_id")
    params = {"day": today, **scope_params(user)}
    with engine.connect() as c:
        total_employees = c.execute(text("SELECT COUNT(*) FROM demo_employees WHERE active=1 AND " + scope), params).scalar() or 0
        rows = c.execute(text("SELECT location_id,status,COUNT(*) count FROM demo_attendance WHERE day=:day AND " + scope + " GROUP BY location_id,status"), params).mappings()
        by_location = {}
        for row in rows:
            by_location.setdefault(row["location_id"], {"checked_in": 0, "completed": 0, "not_in": 0})[row["status"]] = row["count"]
        checked = sum(v["checked_in"] for v in by_location.values())
        completed = sum(v["completed"] for v in by_location.values())
    return {
        "day": today,
        "employees": total_employees,
        "checked_in": checked,
        "completed": completed,
        "not_checked_in": max(total_employees - checked - completed, 0),
        "locations": [{**loc, "today": by_location.get(loc["id"], {"checked_in": 0, "completed": 0, "not_in": 0})} for loc in location_rows(user)],
    }


@app.get("/api/reports/monthly")
def monthly_report(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    day: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    location_id: str = "",
    user=Depends(current_user),
):
    params = {"month": month + "-%", **scope_params(user)}
    scope = scoped_sql(user, "a.location_id")
    sql = f"""
      SELECT a.day,a.employee_id,e.name employee_name,a.location_id,l.name location_name,
             a.status,a.check_in,a.check_out,a.source
      FROM demo_attendance a
      JOIN demo_employees e ON e.id=a.employee_id
      JOIN demo_locations l ON l.id=a.location_id
      WHERE a.day LIKE :month AND {scope}
    """
    with engine.connect() as c:
        if day:
            if not day.startswith(month + "-"):
                raise HTTPException(400, "Day must be inside the selected month")
            sql += " AND a.day=:day"; params["day"] = day
        if location_id:
            require_location_access(c, user, location_id)
            sql += " AND a.location_id=:location"; params["location"] = location_id
        sql += " ORDER BY a.day DESC,l.name,e.name LIMIT 500"
        rows = [dict(r) for r in c.execute(text(sql), params).mappings()]
    for row in rows:
        row["hours"] = worked_hours(row.get("check_in"), row.get("check_out"))
    return {"month": month, "day": day, "rows": rows, "data_notice": "Fictional sample data only"}


@app.get("/api/reports/months")
def month_history(months: int = Query(6, ge=1, le=12), user=Depends(current_user)):
    today = local_today().replace(day=1)
    starts = []
    year, month = today.year, today.month
    for _ in range(months):
        starts.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    result = []
    with engine.connect() as c:
        for item in starts:
            params = {"month": item + "-%", **scope_params(user)}
            rows = c.execute(text("SELECT status,COUNT(*) count FROM demo_attendance WHERE day LIKE :month AND " + scoped_sql(user, "location_id") + " GROUP BY status"), params).mappings().all()
            counts = {"checked_in": 0, "completed": 0, "not_in": 0}
            counts.update({r["status"]: r["count"] for r in rows})
            result.append({"month": item, **counts, "total_records": sum(counts.values())})
    return result


@app.get("/api/reports/export.csv")
def export_csv(month: str = Query(pattern=r"^\d{4}-\d{2}$"), location_id: str = "", user=Depends(current_user)):
    params = {"month": month + "-%", **scope_params(user)}
    sql = "SELECT a.day,e.id employee_id,e.name,l.name location,a.status,a.check_in,a.check_out,a.source FROM demo_attendance a JOIN demo_employees e ON e.id=a.employee_id JOIN demo_locations l ON l.id=a.location_id WHERE a.day LIKE :month AND " + scoped_sql(user, "a.location_id")
    with engine.connect() as c:
        if location_id:
            require_location_access(c, user, location_id)
            sql += " AND a.location_id=:location"; params["location"] = location_id
        sql += " ORDER BY a.day,e.id"
        rows = [dict(r) for r in c.execute(text(sql), params).mappings()]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["day", "employee_id", "name", "location", "status", "check_in", "check_out", "source"])
    writer.writeheader(); writer.writerows(rows)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=guardflow-{month}.csv"})


@app.get("/api/settings")
def settings(user=Depends(current_user)):
    locations = location_rows(user)
    with engine.connect() as c:
        if user["role"] == "admin":
            users = [dict(r) for r in c.execute(text("SELECT id,name,role FROM demo_users ORDER BY role,id")).mappings()]
            grants = c.execute(text("SELECT user_id,location_id FROM demo_user_locations")).mappings().all()
            by_user = {}
            for grant in grants:
                by_user.setdefault(grant["user_id"], []).append(grant["location_id"])
            access = [{**u, "location_ids": by_user.get(u["id"], [])} for u in users]
        else:
            access = [{"id": user["id"], "name": user["name"], "role": user["role"], "location_ids": [l["id"] for l in locations]}]
    return {
        "profile": {"name": user["name"], "id": user["id"], "role": user["role"]},
        "locations": locations,
        "access": access,
        "data_notice": "Demo environment. Demo credentials are disabled unless DEMO_MODE=true.",
    }


@app.patch("/api/settings/profile")
def update_profile(body: ProfileBody, user=Depends(current_user)):
    with engine.begin() as c:
        c.execute(text("UPDATE demo_users SET name=:name WHERE id=:id"), {"name": body.name, "id": user["id"]})
        audit(c, user, "settings.profile.update", {"name": body.name})
    return {"id": user["id"], "name": body.name, "role": user["role"]}


@app.post("/api/settings/locations")
def create_location(body: LocationBody, user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin required")
    with engine.begin() as c:
        if c.execute(text("SELECT 1 FROM demo_locations WHERE id=:id"), {"id": body.id}).first():
            raise HTTPException(409, "Location ID already exists")
        c.execute(text("INSERT INTO demo_locations VALUES (:id,:name,:area,:count)"), {"id": body.id, "name": body.name, "area": body.area, "count": body.assigned_count})
        audit(c, user, "settings.location.create", body.model_dump())
    return body.model_dump()


@app.post("/api/settings/access")
def create_access(body: AccessBody, user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin required")
    with engine.begin() as c:
        if c.execute(text("SELECT 1 FROM demo_users WHERE id=:id"), {"id": body.id}).first():
            raise HTTPException(409, "User ID already exists")
        for location_id in body.location_ids:
            if not c.execute(text("SELECT 1 FROM demo_locations WHERE id=:id"), {"id": location_id}).first():
                raise HTTPException(404, f"Location not found: {location_id}")
        insert_user(c, body.id, body.name, body.role, body.password)
        if body.role == "supervisor":
            for location_id in body.location_ids:
                c.execute(text("INSERT INTO demo_user_locations VALUES (:user,:location)"), {"user": body.id, "location": location_id})
        audit(c, user, "settings.access.create", {"id": body.id, "role": body.role, "location_ids": body.location_ids})
    return {"id": body.id, "name": body.name, "role": body.role, "location_ids": body.location_ids}


@app.get("/app")
def frontend():
    return FileResponse(ROOT / "attendance-app.html")
