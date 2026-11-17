// The shift rule for time edits. The server has the same rule (shift_window() in
// backend/demo_app.py) and checks it again. Times are IST "HH:MM". Minutes count from 00:00 on the
// record day, so a value can be below 0 (the day before) or above 1440 (the next day).
import type { Shift } from '@/types/api';

const DAY = 24 * 60;

export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const clock = (mins: number) => {
  const m = ((mins % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export interface ShiftWindow {
  start: number;
  end: number;
  // The shift times as they are set on the site, for example "09:00" and "18:00".
  startHHMM: string;
  endHHMM: string;
}

// The shift that a check-in belongs to: the start (on the day before, the day, or the day after)
// nearest to the check-in. A tie goes to the earlier start. Null when the site has no shift.
export function shiftFor(shifts: Shift[], checkIn: string): ShiftWindow | null {
  if (!shifts.length || !checkIn) return null;
  const at = minutes(checkIn);
  let best: { dist: number; start: number; shift: Shift } | null = null;
  for (const shift of shifts) {
    for (const offset of [-DAY, 0, DAY]) {
      const start = minutes(shift.shift_start) + offset;
      const dist = Math.abs(start - at);
      if (!best || dist < best.dist || (dist === best.dist && start < best.start)) best = { dist, start, shift };
    }
  }
  const { start, shift } = best!;
  let duration = minutes(shift.shift_end) - minutes(shift.shift_start);
  if (duration <= 0) duration += DAY;
  return { start, end: start + duration, startHHMM: shift.shift_start, endHHMM: shift.shift_end };
}

// A check-out that is not later than the check-in on the clock is on the next day.
export const checkoutNextDay = (checkIn: string, checkOut: string) =>
  !!checkOut && minutes(checkOut) <= minutes(checkIn);

// Minutes from 00:00 on the record day to the check-out.
export const checkoutAt = (checkIn: string, checkOut: string) =>
  minutes(checkOut) + (checkoutNextDay(checkIn, checkOut) ? DAY : 0);

export type ShiftProblem = 'check_in_after_end' | 'check_out_after_end' | null;

export function shiftProblem(shift: ShiftWindow | null, checkIn: string, checkOut: string): ShiftProblem {
  if (!shift || !checkIn) return null;
  if (minutes(checkIn) >= shift.end) return 'check_in_after_end';
  if (checkOut && checkoutAt(checkIn, checkOut) > shift.end) return 'check_out_after_end';
  return null;
}

// "2026-11-17" + 1 day → "2026-11-18".
export function addDay(day: string, days = 1) {
  const d = new Date(day + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// One row of the shift editor. Empty times are allowed while the user types.
export interface ShiftRow {
  key: number;
  label?: string | null;
  start: string;
  end: string;
}

export const MAX_SHIFTS = 5;

let nextKey = 1;
// A new editor row, empty or from a saved shift. The key keeps React rows in place.
export const newShiftRow = (s?: Shift): ShiftRow => ({
  key: nextKey++,
  label: s?.label ?? null,
  start: s?.shift_start ?? '',
  end: s?.shift_end ?? '',
});

// The server rules for the shift windows of a site (ShiftBody and _unique_windows in
// backend/demo_app.py): both times, start and end differ, no window two times, at most 5.
// A row with no times is not a shift and is ignored. Returns the first problem, or null.
export function shiftRowsProblem(rows: ShiftRow[]): { row: number; text: string } | null {
  const seen = new Map<string, number>();
  let count = 0;
  for (const [i, r] of rows.entries()) {
    const n = i + 1;
    if (!r.start && !r.end) continue;
    if (!r.start || !r.end) return { row: i, text: `Add both times for shift ${n}, or remove it.` };
    if (r.start === r.end) return { row: i, text: `Shift ${n}: the start and the end must be different.` };
    const key = `${r.start}-${r.end}`;
    if (seen.has(key)) return { row: i, text: `Shift ${n} is the same as shift ${seen.get(key)! + 1}.` };
    seen.set(key, i);
    count++;
  }
  if (count > MAX_SHIFTS) return { row: rows.length - 1, text: `A site can have ${MAX_SHIFTS} shifts or fewer.` };
  return null;
}

// The rows with times, in the shape that the server takes.
export const shiftRowsBody = (rows: ShiftRow[]) =>
  rows.filter((r) => r.start && r.end).map((r) => ({ label: r.label || null, shift_start: r.start, shift_end: r.end }));

// An overnight shift: the end time is before the start time, so it ends the next day.
export const endsNextDay = (start: string, end: string) => !!start && !!end && end < start;
