import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startSession } from '@/auth/session';
import { AppRoutes } from '@/routes';

const SITES = [
  { id: 'loc-hsr', name: 'Bengaluru - HSR Layout', area: 'A', assigned_count: 3, active: 1 },
  { id: 'loc-wf', name: 'Bengaluru - Whitefield', area: 'B', assigned_count: 2, active: 1 },
];
const row = (id: string, name: string, status: string, hours: number | null = null) => ({
  day: '2026-11-17',
  employee_id: id,
  employee_name: name,
  location_id: 'loc-hsr',
  location_name: 'Bengaluru - HSR Layout',
  status,
  check_in: status === 'not_in' ? null : '2026-11-17T03:34:00Z',
  check_out: status === 'completed' ? '2026-11-17T12:32:00Z' : null,
  hours,
});
const DAY = {
  month: '2026-11',
  day: '2026-11-17',
  rows: [row('EMP1', 'Anil', 'not_in'), row('EMP2', 'Meena', 'checked_in'), row('EMP3', 'Suresh', 'completed', 9)],
};
const bucket = (records: number, completed: number) => ({
  records,
  completed,
  checked_in: records - completed,
  not_in: 0,
  avg_hours: 9,
});
const MONTH = {
  month: '2026-11',
  location_id: null,
  totals: bucket(10, 8),
  locations: [
    { ...bucket(6, 6), id: 'loc-hsr', name: 'Bengaluru - HSR Layout', area: 'A', assigned_count: 3, active: 1 },
    { ...bucket(4, 2), id: 'loc-wf', name: 'Bengaluru - Whitefield', area: 'B', assigned_count: 2, active: 1 },
  ],
  days: [],
};
const DETAIL = {
  ...MONTH,
  location_id: 'loc-hsr',
  totals: bucket(6, 6),
  days: [{ ...bucket(3, 2), not_in: 1, day: '2026-11-16' }],
};
const HISTORY = [
  { month: '2026-11', checked_in: 2, completed: 8, not_in: 0, total_records: 10 },
  { month: '2026-10', checked_in: 0, completed: 0, not_in: 0, total_records: 0 },
  { month: '2026-09', checked_in: 0, completed: 5, not_in: 0, total_records: 5 },
];

type Reply = { status: number; body: unknown };
let routes: Record<string, Reply[]>;
let fetchMock: ReturnType<typeof vi.fn>;
const key = (url: string, method = 'GET') => `${method} ${url.split('?')[0]}`;
const reply = (k: string, ...r: Reply[]) => (routes[k] = r);
const calls = (k: string) => fetchMock.mock.calls.filter(([u, o]) => key(u, o?.method) === k);

beforeEach(() => {
  // 6:00 pm IST on Tue 17 Nov 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-17T12:30:00Z'));
  startSession('t', { id: 'admin.demo', name: 'Admin', role: 'admin', company_id: 'c1' });
  routes = {};
  reply('GET /api/locations', { status: 200, body: SITES });
  reply('GET /api/reports/monthly', { status: 200, body: DAY });
  reply('GET /api/reports/summary', { status: 200, body: MONTH });
  reply('GET /api/reports/months', { status: 200, body: HISTORY });
  fetchMock = vi.fn(async (url: string, opts: RequestInit = {}) => {
    const list = routes[key(url, opts.method)];
    if (!list) throw new Error('No mock for ' + key(url, opts.method));
    const r = list.length > 1 ? list.shift()! : list[0];
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Where() {
  const l = useLocation();
  return <output data-testid="url">{l.pathname + l.search}</output>;
}
function show(path = '/reports') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const lastUrl = (k: string) => calls(k).at(-1)?.[0] as string;

describe('Day', () => {
  test('tiles with counts, the status filter with no new request, avg shift, rows', async () => {
    show();
    const tiles = await screen.findByRole('group', { name: 'Filter entries by status' });
    expect(
      within(tiles)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['3 All entries', '1 Checked in', '1 Checked out', '1 Not checked in']);
    expect(screen.getByText('3 guards · 3 entries')).toBeInTheDocument();
    expect(screen.getByText('Avg shift 9.0 h')).toBeInTheDocument();
    expect(screen.getByText('9:04 am – 6:02 pm · 9.0 h')).toHaveClass('text-muted-foreground');
    expect(lastUrl('GET /api/reports/monthly')).toContain('location_id=loc-hsr');
    const loads = calls('GET /api/reports/monthly').length;
    await userEvent.click(within(tiles).getByRole('button', { name: '1 Not checked in' }));
    expect(screen.getByText('1 entry · not checked in')).toBeInTheDocument();
    expect(screen.queryByText('Meena')).not.toBeInTheDocument();
    expect(calls('GET /api/reports/monthly')).toHaveLength(loads);
    expect(screen.getByTestId('url')).toHaveTextContent('status=not_in');
  });

  test('the tabs: the selected tab is pressed', async () => {
    show();
    const tabs = await screen.findByRole('group', { name: 'Report type' });
    expect(within(tabs).getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(tabs).getByRole('button', { name: 'Month' }));
    expect(within(tabs).getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(tabs).getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the search finds a name or a guard ID with no new request', async () => {
    show();
    await screen.findByText('Anil');
    const loads = calls('GET /api/reports/monthly').length;
    const search = screen.getByRole('searchbox', { name: 'Search guards by name or guard ID' });
    await userEvent.type(search, 'meena');
    expect(screen.getByText('1 entry found')).toBeInTheDocument();
    expect(screen.queryByText('Anil')).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'emp3');
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.queryByText('Meena')).not.toBeInTheDocument();
    await userEvent.type(search, '9');
    expect(screen.getByRole('heading', { name: 'No guards match "emp39"' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveValue('');
    expect(screen.getByText('3 guards · 3 entries')).toBeInTheDocument();
    expect(calls('GET /api/reports/monthly')).toHaveLength(loads);
  });

  test('the date and the site change the request', async () => {
    show();
    await screen.findByText('Anil');
    fireEvent.change(screen.getByLabelText('Change date, now Tue 17 Nov'), { target: { value: '2026-11-16' } });
    await waitFor(() => expect(lastUrl('GET /api/reports/monthly')).toContain('day=2026-11-16'));
    await userEvent.click(screen.getByRole('button', { name: 'Change site, now HSR Layout' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('radio', { name: /Whitefield/ }));
    await waitFor(() => expect(lastUrl('GET /api/reports/monthly')).toContain('location_id=loc-wf'));
  });

  test('empty states: no guards today, a future day, a past day', async () => {
    reply('GET /api/reports/monthly', { status: 200, body: { ...DAY, rows: [] } });
    const { unmount } = show();
    expect(await screen.findByRole('heading', { name: 'No guards at this site' })).toBeInTheDocument();
    unmount();
    show('/reports?date=2026-11-20');
    expect(await screen.findByRole('heading', { name: 'No attendance for this day yet' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to today' }));
    await waitFor(() => expect(screen.getByTestId('url')).not.toHaveTextContent('date='));
  });

  test('errors: 403 has no "Try again"; 500 has "Try again" and keeps the filters', async () => {
    reply('GET /api/reports/monthly', { status: 403, body: { detail: 'No access' } });
    const { unmount } = show();
    expect(await screen.findByRole('heading', { name: 'No access to this site' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    unmount();
    reply('GET /api/reports/monthly', { status: 500, body: { detail: 'x' } }, { status: 200, body: DAY });
    show('/reports?date=2026-11-16');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText('Anil');
    expect(lastUrl('GET /api/reports/monthly')).toContain('day=2026-11-16');
  });
});

describe('Month and site detail', () => {
  test('the summary numbers one time; a site card opens the detail; a day opens the Day tab', async () => {
    reply('GET /api/reports/summary', { status: 200, body: MONTH }, { status: 200, body: DETAIL });
    show('/reports?tab=month');
    const summary = await screen.findByRole('region', { name: 'Month summary' });
    expect(summary).toHaveTextContent('8 of 10 completed');
    expect(summary).toHaveTextContent('80%');
    expect(summary).toHaveTextContent('2 open · avg shift 9.0 h');
    await userEvent.click(screen.getByRole('link', { name: /HSR Layout/ }));
    expect(await screen.findByRole('heading', { name: 'HSR Layout' })).toBeInTheDocument();
    expect(lastUrl('GET /api/reports/summary')).toContain('location_id=loc-hsr');
    const day = await screen.findByRole('button', { name: /16 Mon/ });
    expect(day).toHaveTextContent('3 of 3 present');
    expect(day).toHaveTextContent('2 checked out · 1 checked in · 1 not checked in');
    expect(screen.getByRole('link', { name: 'Back to Reports' })).toHaveAttribute(
      'href',
      '/reports?tab=month&month=2026-11',
    );
    await userEvent.click(day);
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/reports?date=2026-11-16&site=loc-hsr'));
  });

  test('no records: "Go to this month" for an earlier month', async () => {
    reply('GET /api/reports/summary', { status: 200, body: { ...MONTH, month: '2026-10', totals: bucket(0, 0) } });
    show('/reports?tab=month&month=2026-10');
    expect(await screen.findByRole('heading', { name: 'No attendance this month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to this month' })).toBeInTheDocument();
  });
});

describe('History and Excel', () => {
  test('history rows; no download for a month with no records', async () => {
    show('/reports?tab=history');
    expect(await screen.findByText('In progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download October 2026 as Excel' })).toBeDisabled();
    // "x / y": amber with open entries, green when all are completed. Screen readers get full words.
    expect(screen.getByText('8 / 10').parentElement).toHaveClass('text-amber-text');
    expect(screen.getByText('5 / 5').parentElement).toHaveClass('text-green-text');
    expect(screen.getByText('8 of 10 entries completed')).toHaveClass('sr-only');
    expect(screen.getByText('No records')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excel' })).toBeNull();
    reply('GET /api/reports/export.xlsx', { status: 200, body: 'xlsx' });
    await userEvent.click(screen.getByRole('button', { name: 'Download November 2026 as Excel' }));
    await waitFor(() => expect(calls('GET /api/reports/export.xlsx')).toHaveLength(1));
    expect(lastUrl('GET /api/reports/export.xlsx')).toBe('/api/reports/export.xlsx?month=2026-11');
  });

  test('Excel for the day: disabled with no records; a failure shows a banner', async () => {
    reply('GET /api/reports/export.xlsx', { status: 500, body: { detail: 'x' } });
    show();
    const excel = await screen.findByRole('button', { name: 'Excel' });
    // The same height and white background as the date and site buttons.
    expect(excel).toHaveClass('h-11', 'bg-card');
    await waitFor(() => expect(excel).toBeEnabled());
    await userEvent.click(excel);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the Excel file.');
    expect(lastUrl('GET /api/reports/export.xlsx')).toContain('day=2026-11-17');
  });
});
