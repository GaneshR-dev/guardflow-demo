// Date, time and text helpers. Same output as the helpers in attendance-app.js.
import type { AttendanceStatus, Location } from '@/types/api';

// All attendance times are shown and entered in Indian Standard Time, whatever the device clock says.
export const IST_TZ = 'Asia/Kolkata';

export const dayISO = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

export const istNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ }));
export const todayISO = () => dayISO(istNow());

export const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
export const fmtMonth = (d: Date) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d);

export const fmtTime = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST_TZ }).format(
        new Date(v),
      )
    : '-';
export const nowTime = () => fmtTime(new Date().toISOString());

// Stored UTC ISO -> "HH:MM" IST wall clock for <input type="time"> fields.
export const toHHMM = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST_TZ }).format(
        new Date(v),
      )
    : '';

// Shift times are stored as plain IST "HH:MM" text on the location.
export const fmtShift = (v?: string | null) => {
  if (!v) return '';
  const [h, m] = v.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
};

// Shift windows of a branch: the new list, or the legacy single pair.
export const locationShifts = (l: Location) =>
  l.shifts && l.shifts.length
    ? l.shifts
    : l.shift_start && l.shift_end
      ? [{ shift_start: l.shift_start, shift_end: l.shift_end }]
      : [];

export const shiftLabel = (l: Location) => {
  const shifts = locationShifts(l);
  if (!shifts.length) return 'No shift set';
  if (shifts.length === 1) return fmtShift(shifts[0].shift_start) + ' - ' + fmtShift(shifts[0].shift_end) + ' IST';
  return shifts.length + ' shifts';
};

export const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const plural = (n: number, one: string, many = one + 's') => (n === 1 ? `${n} ${one}` : `${n} ${many}`);

// A branch with only disabled guards reads "0 active employees · 3 disabled", not "0 employees".
export const empCountLabel = (l: Location, one = 'employee', many = one + 's') =>
  Number(l.disabled_count)
    ? `${plural(l.assigned_count, 'active ' + one, 'active ' + many)} · ${plural(Number(l.disabled_count), 'disabled', 'disabled')}`
    : plural(l.assigned_count, one, many);

export const shortLoc = (name?: string | null) => (name || '').split(' - ')[1] || name || '';
export const locCity = (name?: string | null) => ((name || '').includes(' - ') ? (name as string).split(' - ')[0] : '');

export const fmtShortDay = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(iso + 'T00:00:00'),
  );
export const fmtShortMonth = (ym: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(ym + '-01T00:00:00'));
export const fmtCount = (n?: number | null) => Number(n || 0).toLocaleString('en-IN');

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  checked_in: 'Checked in',
  completed: 'Checked out',
  not_in: 'Not checked in',
};
export const STATUS_TONE: Record<AttendanceStatus, 'green' | 'blue' | 'amber'> = {
  checked_in: 'green',
  completed: 'blue',
  not_in: 'amber',
};
