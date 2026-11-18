import { describe, expect, test } from 'vitest';
import type { AttendanceRecord } from '@/types/api';
import { filterRows, matchesSearch } from './filters';

const row = (employee_id: string, name: string, status: AttendanceRecord['status']): AttendanceRecord => ({
  id: null,
  employee_id,
  name,
  location_id: 'loc',
  status,
  check_in: null,
  check_out: null,
});
const ROWS = [
  row('EMP1001', 'Anil Sharma', 'not_in'),
  row('EMP1002', 'Meena P', 'checked_in'),
  row('EMP1003', 'Suresh K', 'completed'),
];

describe('filters on the phone', () => {
  test('search: name or guard ID, no case difference (the server rule)', () => {
    expect(matchesSearch(ROWS[0], 'sharma')).toBe(true);
    expect(matchesSearch(ROWS[0], 'emp1001')).toBe(true);
    expect(matchesSearch(ROWS[0], 'meena')).toBe(false);
    expect(matchesSearch(ROWS[0], '')).toBe(true);
  });

  test('status and search together', () => {
    expect(filterRows(ROWS, 'all', '').map((r) => r.name)).toEqual(['Anil Sharma', 'Meena P', 'Suresh K']);
    expect(filterRows(ROWS, 'checked_in', '').map((r) => r.name)).toEqual(['Meena P']);
    expect(filterRows(ROWS, 'all', 'emp100').length).toBe(3);
    expect(filterRows(ROWS, 'completed', 'anil')).toEqual([]);
  });
});
