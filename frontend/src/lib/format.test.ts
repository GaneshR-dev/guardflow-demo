import { describe, expect, test } from 'vitest';
import type { Location } from '@/types/api';
import {
  dayISO,
  empCountLabel,
  fmtShortDay,
  fmtShortMonth,
  fmtTime,
  initials,
  locCity,
  plural,
  shiftLabel,
  shortLoc,
  toHHMM,
} from './format';

const loc = (extra: Partial<Location> = {}): Location => ({
  id: 'loc-a',
  name: 'Chennai - Anna Nagar',
  area: 'North',
  assigned_count: 3,
  active: 1,
  ...extra,
});

describe('format', () => {
  test('dayISO pads month and day', () => {
    expect(dayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('fmtTime shows IST and a dash for no value', () => {
    expect(fmtTime('2026-11-17T03:30:00Z')).toBe('9:00 am');
    expect(fmtTime(null)).toBe('-');
    expect(toHHMM('2026-11-17T15:45:00Z')).toBe('21:15');
    expect(toHHMM('')).toBe('');
  });

  test('initials and plural', () => {
    expect(initials('Ravi kumar Singh')).toBe('RK');
    expect(plural(1, 'guard')).toBe('1 guard');
    expect(plural(2, 'guard')).toBe('2 guards');
    expect(plural(0, 'person', 'people')).toBe('0 people');
  });

  test('empCountLabel names disabled guards', () => {
    expect(empCountLabel(loc())).toBe('3 guards');
    expect(empCountLabel(loc({ assigned_count: 0, disabled_count: 3 }))).toBe('0 active guards · 3 disabled');
  });

  test('shortLoc and locCity split "City - Branch"', () => {
    expect(shortLoc('Chennai - Anna Nagar')).toBe('Anna Nagar');
    expect(locCity('Chennai - Anna Nagar')).toBe('Chennai');
    expect(shortLoc('Head office')).toBe('Head office');
    expect(locCity('Head office')).toBe('');
  });

  test('shiftLabel uses the shift list, then the old single pair', () => {
    expect(shiftLabel(loc())).toBe('No shift set');
    expect(shiftLabel(loc({ shift_start: '08:00', shift_end: '20:00' }))).toBe('8:00 am - 8:00 pm IST');
    expect(
      shiftLabel(
        loc({
          shifts: [
            { shift_start: '06:00', shift_end: '14:00' },
            { shift_start: '14:00', shift_end: '22:00' },
          ],
        }),
      ),
    ).toBe('2 shifts');
  });

  test('short day and month', () => {
    expect(fmtShortDay('2026-11-17')).toBe('Tue 17 Nov');
    expect(fmtShortMonth('2026-11')).toBe('Nov 2026');
  });
});
