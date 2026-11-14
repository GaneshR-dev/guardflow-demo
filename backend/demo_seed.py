"""Fictional sample-data seeding for the Guardian attendance demo API. Never real business records."""

from __future__ import annotations

from datetime import timedelta

from demo_db import DEMO_MODE, engine
from demo_security import insert_user, iso_dt, local_today, password_hash
from sqlalchemy import text


def seed_demo() -> None:
    """Seed clearly fictional sample history across the last six calendar months."""
    with engine.begin() as c:
        if c.execute(text("SELECT COUNT(*) FROM demo_users")).scalar():
            return
        insert_user(c, "admin.demo", "Admin Demo", "admin", "demo123")
        insert_user(c, "supervisor.demo", "Supervisor Demo", "supervisor", "demo123")
        locations = [
            ("loc-hsr", "Bengaluru - HSR Layout", "HSR Sector 2", 24, "09:00", "18:00"),
            ("loc-whitefield", "Bengaluru - Whitefield", "ITPL Main Road", 18, "08:00", "20:00"),
            ("loc-mysuru", "Mysuru - City Centre", "Devaraja Mohalla", 12, None, None),
        ]
        for row in locations:
            c.execute(
                text(
                    "INSERT INTO demo_locations (id,name,area,assigned_count,shift_start,shift_end,active) VALUES (:id,:name,:area,:count,:shift_start,:shift_end,1)"
                ),
                {
                    "id": row[0],
                    "name": row[1],
                    "area": row[2],
                    "count": row[3],
                    "shift_start": row[4],
                    "shift_end": row[5],
                },
            )
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
                text(
                    "INSERT INTO demo_employees (id,name,phone,role,location_id,active) VALUES (:id,:name,:phone,:role,:location,1)"
                ),
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
                    text(
                        "INSERT INTO demo_attendance VALUES (:id,:employee,:location,:day,:status,:cin,:cout,:source)"
                    ),
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


def seed_access() -> None:
    """Assign demo supervisors to a subset of locations; admins see all."""
    if not DEMO_MODE:
        return
    with engine.begin() as c:
        if c.execute(text("SELECT COUNT(*) FROM demo_user_locations")).scalar():
            return
        available = {row[0] for row in c.execute(text("SELECT id FROM demo_locations"))}
        for user_id, location_id in [
            ("supervisor.demo", "loc-hsr"),
            ("supervisor.demo", "loc-whitefield"),
        ]:
            if location_id in available:
                c.execute(
                    text("INSERT INTO demo_user_locations VALUES (:user,:location)"),
                    {"user": user_id, "location": location_id},
                )


def retire_legacy_demo_account() -> None:
    """Retire only the original built-in demo identity, never business records.

    Runs for existing databases too, including deployments with DEMO_MODE off.
    A customized account with the same ID is left alone for manual review.
    """
    with engine.begin() as c:
        row = c.execute(text("SELECT * FROM demo_users WHERE id='demo'")).mappings().first()
        if not row or row["name"] != "Demo Supervisor" or row["role"] != "supervisor":
            return
        if row["password"] != password_hash("demo123", row["salt"]):
            return
        c.execute(text("DELETE FROM demo_sessions WHERE user_id='demo'"))
        c.execute(text("DELETE FROM demo_user_locations WHERE user_id='demo'"))
        c.execute(text("DELETE FROM demo_users WHERE id='demo'"))
