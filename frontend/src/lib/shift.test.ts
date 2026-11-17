import { describe, expect, test } from 'vitest';
import { addDay, checkoutNextDay, clock, shiftFor, shiftProblem } from './shift';

const DAY_SHIFT = [{ shift_start: '09:00', shift_end: '18:00' }];
const NIGHT = [{ shift_start: '22:00', shift_end: '06:00' }];

describe('shiftFor (the same rule as the server)', () => {
  test('no shift', () => {
    expect(shiftFor([], '09:00')).toBeNull();
  });

  test('day shift, also for an early check-in', () => {
    expect(shiftFor(DAY_SHIFT, '08:40')).toMatchObject({ start: 540, end: 1080, endHHMM: '18:00' });
  });

  test('overnight shift: a check-in after midnight belongs to the evening before', () => {
    expect(shiftFor(NIGHT, '22:10')).toMatchObject({ start: 1320, end: 1320 + 480 });
    expect(shiftFor(NIGHT, '01:00')).toMatchObject({ start: -120, end: 360 });
  });

  test('two shifts: the nearest start; a tie goes to the earlier start', () => {
    const two = [
      { shift_start: '06:00', shift_end: '14:00' },
      { shift_start: '14:00', shift_end: '22:00' },
    ];
    expect(shiftFor(two, '13:50')?.endHHMM).toBe('22:00');
    expect(shiftFor(two, '10:00')?.endHHMM).toBe('14:00');
  });
});

describe('shiftProblem and the check-out day', () => {
  test('check-out at the end is fine; one minute later is not', () => {
    const s = shiftFor(DAY_SHIFT, '09:00');
    expect(shiftProblem(s, '09:00', '18:00')).toBeNull();
    expect(shiftProblem(s, '09:00', '18:01')).toBe('check_out_after_end');
    expect(shiftProblem(s, '09:00', '')).toBeNull();
  });

  test('check-in after the shift end', () => {
    expect(shiftProblem(shiftFor(DAY_SHIFT, '18:30'), '18:30', '')).toBe('check_in_after_end');
  });

  test('overnight: next-day check-out up to the end', () => {
    const s = shiftFor(NIGHT, '22:05');
    expect(checkoutNextDay('22:05', '05:50')).toBe(true);
    expect(shiftProblem(s, '22:05', '05:50')).toBeNull();
    expect(shiftProblem(s, '22:05', '06:30')).toBe('check_out_after_end');
  });

  test('no shift: no limit', () => {
    expect(shiftProblem(null, '09:00', '23:00')).toBeNull();
  });

  test('helpers', () => {
    expect(clock(-120)).toBe('22:00');
    expect(clock(1800)).toBe('06:00');
    expect(addDay('2026-11-30')).toBe('2026-12-01');
  });
});
