"""Change the shifts of one site for one test, and put them back after.

All test files share one in-memory database, so a test must not leave other shifts behind.
"""

from contextlib import contextmanager

from sqlalchemy import text


@contextmanager
def temporary_shifts(engine, location_id, shifts):
    """`shifts` is a list of (start, end) pairs, for example [("22:00", "06:00")]. An empty list means no shift."""
    with engine.begin() as c:
        saved_rows = [
            dict(r)
            for r in c.execute(
                text("SELECT * FROM demo_location_shifts WHERE location_id=:id"), {"id": location_id}
            ).mappings()
        ]
        saved_site = (
            c.execute(text("SELECT shift_start,shift_end FROM demo_locations WHERE id=:id"), {"id": location_id})
            .mappings()
            .first()
        )
        c.execute(text("DELETE FROM demo_location_shifts WHERE location_id=:id"), {"id": location_id})
        for position, (start, end) in enumerate(shifts):
            c.execute(
                text(
                    "INSERT INTO demo_location_shifts (id,location_id,label,shift_start,shift_end,position) "
                    "VALUES (:id,:loc,NULL,:start,:end,:pos)"
                ),
                {
                    "id": f"{location_id}-test-{position}",
                    "loc": location_id,
                    "start": start,
                    "end": end,
                    "pos": position,
                },
            )
        first = shifts[0] if shifts else (None, None)
        c.execute(
            text("UPDATE demo_locations SET shift_start=:start,shift_end=:end WHERE id=:id"),
            {"start": first[0], "end": first[1], "id": location_id},
        )
    try:
        yield
    finally:
        with engine.begin() as c:
            c.execute(text("DELETE FROM demo_location_shifts WHERE location_id=:id"), {"id": location_id})
            for row in saved_rows:
                c.execute(
                    text(
                        "INSERT INTO demo_location_shifts (id,location_id,label,shift_start,shift_end,position) "
                        "VALUES (:id,:location_id,:label,:shift_start,:shift_end,:position)"
                    ),
                    row,
                )
            c.execute(
                text("UPDATE demo_locations SET shift_start=:shift_start,shift_end=:shift_end WHERE id=:id"),
                {**dict(saved_site), "id": location_id},
            )
