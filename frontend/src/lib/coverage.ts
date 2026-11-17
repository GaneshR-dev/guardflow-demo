// Groups the Home locations by what the user must do: gaps first, then sites whose shift has
// not started, then sites where everybody came. Pure functions, so they are easy to test.
import type { DashboardLocation } from '@/types/api';
import { locationShifts, shortLoc } from './format';

export type CoverageGroup = 'attention' | 'upcoming' | 'ok' | 'disabled';

export interface Coverage {
  location: DashboardLocation;
  group: CoverageGroup;
  came: number;
  total: number;
  notIn: number;
  // "HH:MM" of the next shift start, for an upcoming site.
  nextStart?: string;
}

// True when a shift of the site has started by `now` ("HH:MM", IST). A site with no shift set
// counts as started, so its gaps show. An overnight shift (end before start) counts as started
// after its start and before its end.
export function shiftStarted(l: DashboardLocation, now: string): { started: boolean; nextStart?: string } {
  const shifts = locationShifts(l);
  if (!shifts.length) return { started: true };
  const started = shifts.some((s) =>
    s.shift_end < s.shift_start ? now >= s.shift_start || now < s.shift_end : now >= s.shift_start,
  );
  if (started) return { started: true };
  const nextStart = shifts
    .map((s) => s.shift_start)
    .filter((t) => t > now)
    .sort()[0];
  return { started: false, nextStart };
}

export function coverage(l: DashboardLocation, now: string): Coverage {
  const came = l.today.checked_in + l.today.completed;
  const notIn = l.today.not_in;
  const base = { location: l, came, total: came + notIn, notIn };
  if (!l.active) return { ...base, group: 'disabled' };
  const { started, nextStart } = shiftStarted(l, now);
  if (!started) return { ...base, group: 'upcoming', nextStart };
  return { ...base, group: notIn > 0 ? 'attention' : 'ok' };
}

const byName = (a: Coverage, b: Coverage) => shortLoc(a.location.name).localeCompare(shortLoc(b.location.name));

export function groupCoverage(locations: DashboardLocation[], now: string) {
  const all = locations.map((l) => coverage(l, now));
  const pick = (g: CoverageGroup) => all.filter((c) => c.group === g);
  return {
    // The biggest gap first.
    attention: pick('attention').sort((a, b) => b.notIn - a.notIn || byName(a, b)),
    upcoming: pick('upcoming').sort((a, b) => (a.nextStart || '').localeCompare(b.nextStart || '') || byName(a, b)),
    ok: pick('ok').sort(byName),
    disabled: pick('disabled').sort(byName),
  };
}

export const percent = (part: number, whole: number) => (whole ? Math.round((part * 100) / whole) : 0);
