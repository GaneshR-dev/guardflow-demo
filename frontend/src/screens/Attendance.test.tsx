import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startSession } from '@/auth/session';
import { AppRoutes } from '@/routes';
import type { AttendanceAnswer, AttendanceRecord } from '@/types/api';
import { Attendance } from './Attendance';

const SITES = [
  { id: 'loc-hsr', name: 'Bengaluru - HSR Layout', area: 'A', assigned_count: 3, active: 1 },
  { id: 'loc-wf', name: 'Bengaluru - Whitefield', area: 'B', assigned_count: 2, active: 1 },
  { id: 'loc-old', name: 'Bengaluru - Old', area: 'C', assigned_count: 0, active: 0 },
];

const rec = (
  employee_id: string,
  name: string,
  status: AttendanceRecord['status'],
  extra: Partial<AttendanceRecord> = {},
) => ({
  id: status === 'not_in' ? null : 'r-' + employee_id,
  employee_id,
  name,
  location_id: 'loc-hsr',
  status,
  check_in: status === 'not_in' ? null : '2026-11-17T03:34:00Z',
  check_out: status === 'completed' ? '2026-11-17T12:32:00Z' : null,
  ...extra,
});

const ANSWER: AttendanceAnswer = {
  day: '2026-11-17',
  summary: { checked_in: 1, completed: 1, not_in: 1 },
  rows: [
    rec('EMP1', 'Anil Sharma', 'not_in'),
    rec('EMP2', 'Meena P', 'checked_in'),
    rec('EMP3', 'Suresh K', 'completed'),
  ],
  stale_open: [],
};

type Reply = { status: number; body: unknown } | 'network';
let routes: Record<string, Reply[]>;
let fetchMock: ReturnType<typeof vi.fn>;

const key = (url: string, method = 'GET') => `${method} ${url.split('?')[0]}`;
function reply(k: string, ...r: Reply[]) {
  routes[k] = r;
}

beforeEach(() => {
  // 6:00 pm IST.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-17T12:30:00Z'));
  startSession('t', { id: 'admin.demo', name: 'Admin', role: 'admin', company_id: 'c1' });
  routes = {};
  reply('GET /api/locations', { status: 200, body: SITES });
  reply('GET /api/attendance', { status: 200, body: ANSWER });
  reply('GET /api/employee-lookup', { status: 404, body: { detail: 'No employee matches' } });
  fetchMock = vi.fn(async (url: string, opts: RequestInit = {}) => {
    const list = routes[key(url, opts.method)];
    if (!list) throw new Error('No mock for ' + key(url, opts.method));
    const r = list.length > 1 ? list.shift()! : list[0];
    if (r === 'network') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Where() {
  const l = useLocation();
  return <output data-testid="url">{l.pathname + l.search}</output>;
}

function show(path = '/attendance?location=loc-hsr') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/attendance"
            element={
              <>
                <Attendance />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const calls = (k: string) => fetchMock.mock.calls.filter(([u, o]) => key(u, o?.method) === k);
const lastUrl = (k: string) => calls(k).at(-1)?.[0] as string;
const list = () => screen.getByRole('region', { name: 'Guards at this site' });

describe('Attendance', () => {
  test('loads the site, shows the counts one time and an action on each row', async () => {
    show();
    expect(await screen.findByText('Loading attendance at HSR Layout…')).toBeInTheDocument();
    await screen.findByText('Anil Sharma');
    const filters = screen.getByRole('group', { name: 'Filter by status' });
    expect(
      within(filters)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['3 All', '1 Not checked in', '1 Checked in', '1 Checked out']);
    expect(within(list()).getByRole('button', { name: 'Check in Anil Sharma' })).toBeInTheDocument();
    expect(within(list()).getByRole('button', { name: 'Check out Meena P' })).toBeInTheDocument();
    // A guard who checked out can start one more shift.
    expect(within(list()).getByRole('button', { name: 'Check in Suresh K' })).toBeInTheDocument();
    expect(within(list()).getByText('Checked in 9:04 am')).toHaveClass('text-green-text');
    expect(within(list()).getByText('9:04 am – 6:02 pm')).toHaveClass('text-muted-foreground');
    expect(within(list()).getByText('Not checked in')).toHaveClass('text-amber-text');
    expect(lastUrl('GET /api/attendance')).toContain('location_id=loc-hsr');
  });

  test('a filter changes the URL and the request; the site sheet changes the site', async () => {
    show();
    await screen.findByText('Anil Sharma');
    await userEvent.click(screen.getByRole('button', { name: '1 Not checked in' }));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('status=not_in'));
    await waitFor(() => expect(lastUrl('GET /api/attendance')).toContain('status=not_in'));
    await userEvent.click(screen.getByRole('button', { name: 'Change site, now HSR Layout' }));
    const sheet = await screen.findByRole('dialog', { name: 'Choose site' });
    // Disabled sites are not offered for attendance.
    expect(within(sheet).queryByText('Old')).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('radio', { name: /Whitefield/ }));
    await waitFor(() => expect(lastUrl('GET /api/attendance')).toContain('location_id=loc-wf'));
    expect(screen.getByTestId('url')).toHaveTextContent('status=not_in');
  });

  test('check in: the dialog, one request for two taps, a toast and a new load', async () => {
    let finish!: (r: Response) => void;
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Check in Anil Sharma' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Confirm check-in' });
    expect(dialog).toHaveTextContent('Anil Sharma (EMP1)');
    expect(dialog).toHaveTextContent('6:00 pm IST');
    expect(dialog).toHaveTextContent('HSR Layout');
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (finish = r)));
    const ok = within(dialog).getByRole('button', { name: 'Check in' });
    await userEvent.dblClick(ok);
    expect(ok).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/attendance/checkin')).toHaveLength(1);
    const before = calls('GET /api/attendance').length;
    finish(new Response(JSON.stringify({ employee_id: 'EMP1', name: 'Anil Sharma' }), { status: 200 }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(calls('GET /api/attendance').length).toBeGreaterThan(before));
  });

  test('second shift: a second dialog, then a request with confirm_second_shift', async () => {
    reply(
      'POST /api/attendance/checkin',
      { status: 200, body: { requires_confirmation: true, prior_shifts: 1, employee_id: 'EMP1', name: 'Anil Sharma' } },
      { status: 200, body: { employee_id: 'EMP1', name: 'Anil Sharma' } },
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Check in Anil Sharma' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Check in' }));
    const second = await screen.findByRole('alertdialog', { name: 'Second shift today' });
    expect(second).toHaveTextContent('Shifts checked out today1');
    // A tap at once (for example the second tap of a double tap) does nothing.
    await userEvent.click(within(second).getByRole('button', { name: 'Check in' }));
    expect(calls('POST /api/attendance/checkin')).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 450));
    await userEvent.click(within(second).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const bodies = calls('POST /api/attendance/checkin').map(([, o]) => JSON.parse(o.body).confirm_second_shift);
    expect(bodies).toEqual([false, true]);
  });

  test('409 on check-in: the server message stays in the open dialog', async () => {
    reply('POST /api/attendance/checkin', {
      status: 409,
      body: { detail: 'Employee is already checked in at another site' },
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Check in Anil Sharma' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check in' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already checked in at another site');
    expect(within(dialog).getByRole('button', { name: 'Check in' })).toBeEnabled();
  });

  test('403 on an action: the dialog closes and the screen says no access, without "Try again"', async () => {
    reply('POST /api/attendance/checkin', { status: 403, body: { detail: 'No access' } });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Check in Anil Sharma' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Check in' }));
    expect(await screen.findByRole('heading', { name: 'No access to this site' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  test('check out: hours worked from the open record; a check-in left open from an earlier day', async () => {
    reply('GET /api/attendance', {
      status: 200,
      body: {
        ...ANSWER,
        stale_open: [
          {
            day: '2026-11-16',
            employee_id: 'EMP9',
            name: 'Ravi Kumar',
            check_in: '2026-11-16T16:32:00Z',
            location_id: 'loc-hsr',
          },
        ],
      },
    });
    reply('POST /api/attendance/checkout', {
      status: 200,
      body: { employee_id: 'EMP9', name: 'Ravi Kumar', note: 'Closed the check-in left open since 2026-11-16.' },
    });
    show();
    const stale = await screen.findByRole('region', { name: 'Open from earlier days' });
    expect(stale).toHaveTextContent('Since Mon 16 Nov, 10:02 pm');
    await userEvent.click(within(stale).getByRole('button', { name: 'Check out Ravi Kumar' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Confirm check-out' });
    expect(dialog).toHaveTextContent('Checked in onMon 16 Nov');
    expect(dialog).toHaveTextContent('Hours worked19h 58m');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check out' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(JSON.parse(calls('POST /api/attendance/checkout')[0][1].body)).toEqual({
      employee_id: 'EMP9',
      location_id: 'loc-hsr',
    });
  });

  test('load errors: 500 has "Try again" and keeps the filter; 403 says no access', async () => {
    reply('GET /api/attendance', { status: 500, body: { detail: 'boom' } }, { status: 200, body: ANSWER });
    const { unmount } = show('/attendance?location=loc-hsr&status=checked_in');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the attendance');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Anil Sharma');
    expect(lastUrl('GET /api/attendance')).toContain('status=checked_in');
    unmount();
    reply('GET /api/attendance', { status: 403, body: { detail: 'No access' } });
    show();
    expect(await screen.findByRole('heading', { name: 'No access to this site' })).toBeInTheDocument();
  });

  test('an unknown site in the URL shows "Site not found" with a way to choose a site', async () => {
    show('/attendance?location=loc-gone');
    expect(await screen.findByRole('heading', { name: 'Site not found' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose site' })).toBeInTheDocument();
  });

  test('search: other guards from other sites, with ad hoc and disabled rules', async () => {
    reply('GET /api/employee-lookup', {
      status: 200,
      body: {
        matches: [
          { id: 'EMP2', name: 'Meena P', location_id: 'loc-hsr', location_name: 'Bengaluru - HSR Layout', active: 1 },
          { id: 'EMP44', name: 'Meena R', location_id: 'loc-wf', location_name: 'Bengaluru - Whitefield', active: 1 },
          { id: 'EMP45', name: 'Meena S', location_id: 'loc-wf', location_name: 'Bengaluru - Whitefield', active: 0 },
        ],
      },
    });
    show();
    await screen.findByText('Anil Sharma');
    await userEvent.type(screen.getByRole('searchbox'), 'meena');
    const others = await screen.findByRole('region', { name: 'Other guards matching "meena"' });
    expect(within(others).queryByText('Meena P')).not.toBeInTheDocument();
    expect(within(others).getByText('ad hoc')).toBeInTheDocument();
    expect(within(others).getByRole('button', { name: 'Check in Meena R' })).toBeInTheDocument();
    expect(within(others).getByText('Disabled. An admin can enable this guard.')).toBeInTheDocument();
    expect(within(others).queryByRole('button', { name: 'Check in Meena S' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('q=meena'));
    await waitFor(() => expect(lastUrl('GET /api/attendance')).toContain('q=meena'));
  });

  test('admin can edit times and add a guard; a 400 stays in the edit sheet', async () => {
    reply('PATCH /api/attendance/times', {
      status: 400,
      body: { detail: 'Check-out must be after the check-in time' },
    });
    show();
    expect(await screen.findByRole('button', { name: 'Add a guard' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit times for Suresh K' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit times · Suresh K' });
    expect(within(sheet).getByLabelText('Check-in time')).toHaveValue('09:04');
    expect(within(sheet).getByLabelText('Check-out time')).toHaveValue('18:02');
    expect(within(sheet).getByLabelText('Reason').tagName).toBe('TEXTAREA');
    await userEvent.type(within(sheet).getByLabelText('Reason'), 'Wrong time');
    expect(within(sheet).getByText('10/200')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save times' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Check-out must be after the check-in time');
    expect(within(sheet).getByLabelText('Reason')).toHaveValue('Wrong time');
  });

  test('a supervisor sees no edit button and no "Add a guard"', async () => {
    startSession('t', { id: 'supervisor.demo', name: 'Sup', role: 'supervisor', company_id: 'c1' });
    show();
    await screen.findByText('Suresh K');
    expect(screen.queryByRole('button', { name: /Edit times/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a guard' })).not.toBeInTheDocument();
  });

  test('empty filter: tells why and offers "Show all"', async () => {
    reply('GET /api/attendance', { status: 200, body: { ...ANSWER, rows: [] } });
    show('/attendance?location=loc-hsr&status=checked_in');
    expect(await screen.findByRole('heading', { name: 'No guards are checked in.' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() => expect(screen.getByTestId('url')).not.toHaveTextContent('status='));
  });
});

describe('Attendance cards and page actions', () => {
  test('each guard is a separate card; actions have the same width; edit is at the top of the card', async () => {
    show();
    const cards = await within(await screen.findByRole('region', { name: 'Guards at this site' })).findAllByRole(
      'listitem',
    );
    expect(cards).toHaveLength(3);
    const checkIn = screen.getByRole('button', { name: 'Check in Anil Sharma' });
    const checkOut = screen.getByRole('button', { name: 'Check out Meena P' });
    expect(checkIn).toHaveClass('w-28');
    expect(checkOut).toHaveClass('w-28');
    // Every "Check in" is the same filled button, also on a checked-out card.
    expect(checkIn).toHaveAttribute('data-variant', 'default');
    expect(screen.getByRole('button', { name: 'Check in Suresh K' })).toHaveAttribute('data-variant', 'default');
    expect(checkOut).toHaveAttribute('data-variant', 'outline');
    // The edit button is in the first line of the card (with the name), not next to the action.
    const meena = cards[1];
    const edit = within(meena).getByRole('button', { name: 'Edit times for Meena P' });
    expect(edit.closest('div')).toContainElement(within(meena).getByText('Meena P'));
    expect(edit.closest('div')).not.toContainElement(checkOut);
  });

  test('admin: "Add a guard" at the top; the bottom card shows only when a search finds nobody', async () => {
    show();
    await screen.findByText('Anil Sharma');
    const top = screen.getByRole('button', { name: 'Add a guard' });
    expect(top.closest('div')).toContainElement(screen.getByRole('heading', { name: 'Mark attendance' }));
    expect(screen.queryByText(/Can't find a guard\?/)).not.toBeInTheDocument();
    reply('GET /api/attendance', { status: 200, body: { ...ANSWER, rows: [] } });
    await userEvent.type(screen.getByRole('searchbox'), 'zz');
    expect(await screen.findByText(/Can't find a guard\?/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add a guard' })).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('button', { name: 'Add a guard' })[1]);
    expect(await screen.findByRole('dialog', { name: 'Add a guard' })).toBeInTheDocument();
  });

  test('supervisor: no "Add a guard"; the empty search says to ask an admin', async () => {
    startSession('t', { id: 'supervisor.demo', name: 'Sup', role: 'supervisor', company_id: 'c1' });
    reply('GET /api/attendance', { status: 200, body: { ...ANSWER, rows: [] } });
    show('/attendance?location=loc-hsr&q=zz');
    expect(await screen.findByText(/Ask an admin to add the guard\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a guard' })).not.toBeInTheDocument();
  });
});

describe('Edit times uses the site shift', () => {
  const withShift = (shift_start: string, shift_end: string) =>
    reply('GET /api/locations', {
      status: 200,
      body: SITES.map((l) => (l.id === 'loc-hsr' ? { ...l, shifts: [{ shift_start, shift_end }] } : l)),
    });
  async function openSheet(name = 'Meena P') {
    show();
    await userEvent.click(await screen.findByRole('button', { name: `Edit times for ${name}` }));
    return screen.findByRole('dialog', { name: `Edit times · ${name}` });
  }
  const setTime = (sheet: HTMLElement, label: string, value: string) =>
    fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });

  test('a new check-in fills the check-out with the shift end; the date is worked out', async () => {
    withShift('09:00', '18:00');
    const sheet = await openSheet();
    expect(sheet).toHaveTextContent('Shift 9:00 am – 6:00 pm');
    expect(within(sheet).queryByLabelText('Check-out date')).not.toBeInTheDocument();
    setTime(sheet, 'Check-in time', '09:10');
    expect(within(sheet).getByLabelText('Check-out time')).toHaveValue('18:00');
    expect(sheet).toHaveTextContent('Check-out: Tue 17 Nov');
  });

  test('a check-out after the shift end shows an error and blocks Save', async () => {
    withShift('09:00', '18:00');
    const sheet = await openSheet();
    setTime(sheet, 'Check-out time', '18:30');
    expect(within(sheet).getByRole('alert')).toHaveTextContent(
      'Check-out must be at or before the shift end (6:00 pm).',
    );
    await userEvent.type(within(sheet).getByLabelText('Reason'), 'Late fix');
    expect(within(sheet).getByRole('button', { name: 'Save times' })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Use shift end' }));
    expect(within(sheet).getByLabelText('Check-out time')).toHaveValue('18:00');
    expect(within(sheet).getByRole('button', { name: 'Save times' })).toBeEnabled();
  });

  test('a typed check-out stays when the check-in changes; "Still at work" clears it', async () => {
    withShift('09:00', '18:00');
    const sheet = await openSheet();
    setTime(sheet, 'Check-out time', '17:00');
    setTime(sheet, 'Check-in time', '09:30');
    expect(within(sheet).getByLabelText('Check-out time')).toHaveValue('17:00');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Still at work' }));
    expect(within(sheet).getByLabelText('Check-out time')).toHaveValue('');
    expect(sheet).toHaveTextContent('No check-out: the guard is still at work.');
  });

  test('overnight shift: the check-out is on the next day, and the server works out the date', async () => {
    withShift('22:00', '06:00');
    reply('PATCH /api/attendance/times', { status: 200, body: {} });
    const sheet = await openSheet();
    setTime(sheet, 'Check-in time', '22:05');
    expect(within(sheet).getByLabelText('Check-out time')).toHaveValue('06:00');
    expect(sheet).toHaveTextContent('Check-out: Wed 18 Nov (next day)');
    await userEvent.type(within(sheet).getByLabelText('Reason'), 'Night shift fix');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save times' }));
    await waitFor(() => expect(calls('PATCH /api/attendance/times')).toHaveLength(1));
    expect(JSON.parse(calls('PATCH /api/attendance/times')[0][1].body)).toMatchObject({
      check_in: '22:05',
      check_out: '06:00',
      check_out_day: null,
    });
  });

  test('a site with no shift says so and has no limit', async () => {
    const sheet = await openSheet();
    expect(sheet).toHaveTextContent('No shift set for this site.');
    setTime(sheet, 'Check-out time', '23:00');
    expect(within(sheet).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('old Attendance routes', () => {
  test.each([
    ['/attendance/add', 'status=not_in'],
    ['/attendance/checkout', 'status=checked_in'],
  ])('%s opens the filter %s', async (path, filter) => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
          <Where />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent(`/attendance?${filter}`));
  });
});
