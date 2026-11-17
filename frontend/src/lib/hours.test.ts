import { describe, expect, test } from 'vitest';
import type { AttendanceRecord, StaleOpen } from '@/types/api';
import { hoursWorked, oneRowEach, openRecord } from './hours';

const row = (
  employee_id: string,
  status: AttendanceRecord['status'],
  check_in: string | null = null,
): AttendanceRecord => ({
  id: employee_id + status,
  employee_id,
  name: employee_id,
  location_id: 'loc',
  status,
  check_in,
  check_out: null,
});
const stale = (employee_id: string, day: string, check_in: string): StaleOpen => ({
  employee_id,
  day,
  check_in,
  name: employee_id,
  location_id: 'loc',
});

describe('hoursWorked', () => {
  test('hours and minutes, never negative', () => {
    const now = Date.parse('2026-11-17T12:35:00Z');
    expect(hoursWorked('2026-11-17T04:30:00Z', now)).toBe('8h 05m');
    expect(hoursWorked('2026-11-17T13:00:00Z', now)).toBe('0h 00m');
    expect(hoursWorked(null, now)).toBe('0h 00m');
  });
});

describe('openRecord', () => {
  test("today's open row first", () => {
    const r = openRecord(
      'a',
      [row('a', 'checked_in', '2026-11-17T04:00:00Z')],
      [stale('a', '2026-11-16', '2026-11-16T16:00:00Z')],
    );
    expect(r?.check_in).toBe('2026-11-17T04:00:00Z');
  });

  test('a placeholder row with no time does not count; the newest older open record is used', () => {
    const r = openRecord(
      'a',
      [row('a', 'checked_in', null)],
      [stale('a', '2026-11-15', '2026-11-15T16:00:00Z'), stale('a', '2026-11-16', '2026-11-16T16:00:00Z')],
    );
    expect(r?.day).toBe('2026-11-16');
  });

  test('no open record', () => {
    expect(openRecord('a', [row('a', 'completed', '2026-11-17T04:00:00Z')], [])).toBeNull();
  });
});

describe('oneRowEach', () => {
  test('keeps the checked-in row of a guard with two rows', () => {
    const out = oneRowEach([row('a', 'completed', 'x'), row('b', 'not_in'), row('a', 'checked_in', 'y')]);
    expect(out.map((r) => `${r.employee_id}:${r.status}`)).toEqual(['a:checked_in', 'b:not_in']);
  });
});
