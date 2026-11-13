"""Guardian attendance demo API.

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
import re
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

from demo_db import DEMO_MODE, engine, init_db
from demo_security import (
    insert_user,
    iso_dt,
    local_today,
    login_throttle_check,
    login_throttle_clear,
    login_throttle_record,
    password_hash,
    token_digest,
    utcnow,
)
from demo_seed import seed_access, seed_demo

init_db()
if DEMO_MODE:
    seed_demo()
seed_access()

API_DOCS_ENABLED = os.environ.get("API_DOCS", "true").lower() == "true"
app = FastAPI(
    title="Guardian Attendance API",
    version="0.4.0",
    docs_url="/docs" if API_DOCS_ENABLED else None,
    redoc_url="/redoc" if API_DOCS_ENABLED else None,
    openapi_url="/openapi.json" if API_DOCS_ENABLED else None,
)
bearer = HTTPBearer(auto_error=False)



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


class ResetBody(BaseModel):
    confirm: str = Field(min_length=1, max_length=40)


class LocationImportRow(BaseModel):
    id: str | None = Field(default=None, max_length=40, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=3, max_length=100)
    area: str = Field(min_length=2, max_length=100)
    assigned_count: int = Field(default=0, ge=0, le=10000)


class LocationImportBody(BaseModel):
    rows: list[LocationImportRow] = Field(min_length=1, max_length=200)


@app.post("/api/login")
def login(body: LoginBody):
    key = body.username.strip().lower()
    login_throttle_check(key)
    with engine.begin() as c:
        row = c.execute(text("SELECT * FROM demo_users WHERE id=:id"), {"id": body.username}).mappings().first()
        if not row or not hmac.compare_digest(password_hash(body.password, row["salt"]), row["password"]):
            login_throttle_record(key)
            raise HTTPException(401, "Invalid user ID or password")
        login_throttle_clear(key)
        c.execute(text("DELETE FROM demo_sessions WHERE expires<:now"), {"now": utcnow().isoformat()})
        token = secrets.token_urlsafe(32)
        c.execute(
            text("INSERT INTO demo_sessions VALUES (:token,:user,:expires)"),
            {"token": token_digest(token), "user": row["id"], "expires": (utcnow() + timedelta(hours=10)).isoformat()},
        )
        return {"token": token, "user": {"id": row["id"], "name": row["name"], "role": row["role"]}}


@app.post("/api/logout")
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials:
        with engine.begin() as c:
            c.execute(text("DELETE FROM demo_sessions WHERE token=:token"), {"token": token_digest(credentials.credentials)})
    return {"status": "signed out"}


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


def attendance_summary(c, location_id: str, day: date) -> dict:
    total_employees = c.execute(
        text("SELECT COUNT(*) FROM demo_employees WHERE active=1 AND location_id=:location"),
        {"location": location_id},
    ).scalar() or 0
    rows = c.execute(
        text("SELECT status,COUNT(*) count FROM demo_attendance WHERE location_id=:location AND day=:day AND status IN ('checked_in','completed') GROUP BY status"),
        {"location": location_id, "day": day.isoformat()},
    ).mappings().all()
    counts = {"checked_in": 0, "completed": 0}
    counts.update({r["status"]: r["count"] for r in rows})
    return {**counts, "not_in": max(total_employees - counts["checked_in"] - counts["completed"], 0)}


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


def new_employee_id(c) -> str:
    """Random unique employee ID; avoids the count-based allocation race."""
    for _ in range(25):
        candidate = f"EMP{secrets.randbelow(9000) + 1000}"
        if not c.execute(text("SELECT 1 FROM demo_employees WHERE id=:id"), {"id": candidate}).first():
            return candidate
    raise HTTPException(500, "Could not allocate an employee ID")


@app.post("/api/employees")
def add_employee(body: EmployeeBody, user=Depends(current_user)):
    if user["role"] not in ("admin", "supervisor"):
        raise HTTPException(403, "Admin or supervisor required")
    require_role_write(user, body.role)
    with engine.begin() as c:
        require_location_access(c, user, body.location_id)
        employee_id = new_employee_id(c)
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
        for row in body.rows:
            require_role_write(user, row.role)
            require_location_access(c, user, row.location_id)
            employee_id = row.id
            if not employee_id:
                employee_id = new_employee_id(c)
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
      SELECT a.id,e.id employee_id,e.name,e.phone,e.role,e.location_id,
             COALESCE(a.status,'not_in') status,a.check_in,a.check_out,
             COALESCE(a.source,'not recorded') source
      FROM demo_employees e
      LEFT JOIN demo_attendance a ON a.employee_id=e.id AND a.day=:day
      WHERE e.active=1 AND e.location_id=:location
    """
    params = {"location": location_id, "day": selected_day}
    if q:
        sql += " AND (lower(e.name) LIKE :q OR lower(e.id) LIKE :q)"; params["q"] = f"%{q.lower()}%"
    if status:
        sql += " AND COALESCE(a.status,'not_in')=:status"; params["status"] = status
    sql += " ORDER BY e.name"
    with engine.connect() as c:
        require_location_access(c, user, location_id)
        rows = [dict(r) for r in c.execute(text(sql), params).mappings()]
        summary = attendance_summary(c, location_id, date.fromisoformat(selected_day))
    return {"day": selected_day, "summary": summary, "rows": rows}


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
        employee_rows = c.execute(text("SELECT location_id,COUNT(*) count FROM demo_employees WHERE active=1 AND " + scope + " GROUP BY location_id"), params).mappings()
        rows = c.execute(text("SELECT location_id,status,COUNT(*) count FROM demo_attendance WHERE day=:day AND status IN ('checked_in','completed') AND " + scope + " GROUP BY location_id,status"), params).mappings()
        employee_counts = {row["location_id"]: row["count"] for row in employee_rows}
        by_location = {}
        for row in rows:
            by_location.setdefault(row["location_id"], {"checked_in": 0, "completed": 0})[row["status"]] = row["count"]
        checked = sum(v["checked_in"] for v in by_location.values())
        completed = sum(v["completed"] for v in by_location.values())
        for loc in location_rows(user):
            counts = by_location.setdefault(loc["id"], {"checked_in": 0, "completed": 0})
            counts["not_in"] = max(employee_counts.get(loc["id"], 0) - counts["checked_in"] - counts["completed"], 0)
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
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=guardian-{month}.csv"})


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


def generated_location_id(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return "loc-" + (slug or secrets.token_hex(4))


@app.post("/api/settings/locations/import")
def import_locations(body: LocationImportBody, user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin required")
    explicit_ids = [row.id for row in body.rows if row.id]
    duplicates = sorted({location_id for location_id in explicit_ids if explicit_ids.count(location_id) > 1})
    if duplicates:
        raise HTTPException(400, "Duplicate location IDs in import: " + ", ".join(duplicates))
    created = updated = 0
    with engine.begin() as c:
        for row in body.rows:
            location_id = row.id or generated_location_id(row.name)
            existing = c.execute(text("SELECT * FROM demo_locations WHERE id=:id"), {"id": location_id}).mappings().first()
            if existing:
                c.execute(text("UPDATE demo_locations SET name=:name,area=:area,assigned_count=:count WHERE id=:id"), {"id": location_id, "name": row.name, "area": row.area, "count": row.assigned_count})
                updated += 1
            else:
                c.execute(text("INSERT INTO demo_locations VALUES (:id,:name,:area,:count)"), {"id": location_id, "name": row.name, "area": row.area, "count": row.assigned_count})
                created += 1
        audit(c, user, "settings.location.import", {"created": created, "updated": updated})
    return {"created": created, "updated": updated}


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
