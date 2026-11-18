// Helpers for the Attendance screen. Pure functions, so they are easy to test.
import type { AttendanceRecord, StaleOpen } from '@/types/api';

// "8h 05m" between a check-in and `now` (milliseconds). Never negative.
export function hoursWorked(checkIn: string | null, now: number) {
  const start = checkIn ? new Date(checkIn).getTime() : now;
  const mins = Math.max(0, Math.round((now - start) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// The open record that the server closes on check-out: today's checked-in row first, then the
// newest check-in left open from an earlier day. A today's row with no check-in time is a
// placeholder for an overnight guard, so it does not count.
export function openRecord(
  employeeId: string,
  rows: AttendanceRecord[],
  stale: StaleOpen[],
): { name: string; check_in: string | null; day?: string } | null {
  const today = rows.find((r) => r.employee_id === employeeId && r.status === 'checked_in' && r.check_in);
  if (today) return today;
  const older = stale
    .filter((r) => r.employee_id === employeeId && r.check_in)
    .sort((a, b) => (a.day < b.day ? 1 : -1));
  return older[0] ?? null;
}

// One row for each guard. When a guard has two rows (for example an earlier shift and an open
// one), keep the checked-in row, else the first row.
export function oneRowEach(rows: AttendanceRecord[]) {
  const out: AttendanceRecord[] = [];
  for (const r of rows) {
    const i = out.findIndex((x) => x.employee_id === r.employee_id);
    if (i < 0) out.push(r);
    else if (r.status === 'checked_in' && out[i].status !== 'checked_in') out[i] = r;
  }
  return out;
}
