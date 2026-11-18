import { describe, expect, test } from 'vitest';
import type { DashboardLocation } from '@/types/api';
import { groupCoverage, percent, shiftStarted } from './coverage';

const loc = (
  id: string,
  today: [number, number, number],
  extra: Partial<DashboardLocation> = {},
): DashboardLocation => ({
  id,
  name: 'City - ' + id,
  area: 'Area',
  assigned_count: today.reduce((a, b) => a + b, 0),
  active: 1,
  shifts: [{ shift_start: '09:00', shift_end: '18:00' }],
  today: { checked_in: today[0], completed: today[1], not_in: today[2] },
  ...extra,
});

describe('shiftStarted', () => {
  test('day shift', () => {
    expect(shiftStarted(loc('a', [0, 0, 1]), '08:59')).toEqual({ started: false, nextStart: '09:00' });
    expect(shiftStarted(loc('a', [0, 0, 1]), '09:00').started).toBe(true);
    expect(shiftStarted(loc('a', [0, 0, 1]), '20:00').started).toBe(true);
  });

  test('overnight shift counts as started after its start and before its end', () => {
    const night = loc('n', [0, 0, 1], { shifts: [{ shift_start: '22:00', shift_end: '06:00' }] });
    expect(shiftStarted(night, '23:00').started).toBe(true);
    expect(shiftStarted(night, '03:00').started).toBe(true);
    expect(shiftStarted(night, '12:00')).toEqual({ started: false, nextStart: '22:00' });
  });

  test('two shifts: the next start is the earliest one still to come', () => {
    const two = loc('t', [0, 0, 1], {
      shifts: [
        { shift_start: '14:00', shift_end: '22:00' },
        { shift_start: '06:00', shift_end: '14:00' },
      ],
    });
    expect(shiftStarted(two, '05:00')).toEqual({ started: false, nextStart: '06:00' });
  });

  test('no shift set counts as started, so gaps show', () => {
    expect(shiftStarted(loc('x', [0, 0, 1], { shifts: [] }), '01:00').started).toBe(true);
  });
});

describe('groupCoverage', () => {
  test('gaps first (biggest first), then upcoming, then complete, then disabled', () => {
    const g = groupCoverage(
      [
        loc('small-gap', [3, 0, 1]),
        loc('big-gap', [0, 0, 9]),
        loc('later', [0, 0, 4], { shifts: [{ shift_start: '14:00', shift_end: '22:00' }] }),
        loc('full', [2, 1, 0]),
        loc('off', [0, 0, 5], { active: 0 }),
      ],
      '10:00',
    );
    expect(g.attention.map((c) => c.location.id)).toEqual(['big-gap', 'small-gap']);
    expect(g.upcoming.map((c) => [c.location.id, c.nextStart])).toEqual([['later', '14:00']]);
    expect(g.ok.map((c) => [c.location.id, c.came, c.total])).toEqual([['full', 3, 3]]);
    expect(g.disabled.map((c) => c.location.id)).toEqual(['off']);
  });

  test('percent', () => {
    expect(percent(19, 54)).toBe(35);
    expect(percent(0, 0)).toBe(0);
  });
});
