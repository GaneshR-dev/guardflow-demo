import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startSession } from '@/auth/session';
import type { Dashboard, DashboardLocation } from '@/types/api';
import { Home } from './Home';

const loc = (id: string, name: string, today: [number, number, number], extra: Partial<DashboardLocation> = {}) => ({
  id,
  name: 'Bengaluru - ' + name,
  area: 'Area',
  assigned_count: today.reduce((a, b) => a + b, 0),
  active: 1,
  shifts: [{ shift_start: '09:00', shift_end: '18:00' }],
  today: { checked_in: today[0], completed: today[1], not_in: today[2] },
  ...extra,
});

const DASH: Dashboard = {
  day: '2026-11-17',
  employees: 54,
  checked_in: 16,
  completed: 3,
  not_checked_in: 35,
  locations: [
    loc('loc-hsr', 'HSR Layout', [16, 3, 5]),
    loc('loc-wf', 'Whitefield', [0, 0, 18]),
    loc('loc-cc', 'City Centre', [0, 0, 12], { shifts: [{ shift_start: '14:00', shift_end: '22:00' }] }),
    loc('loc-old', 'Old Site', [0, 0, 0], { active: 0 }),
  ],
};

let answers: Array<{ status: number; body: unknown } | 'network'>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // 10:30 am IST.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-17T05:00:00Z'));
  startSession('t', { id: 'admin.demo', name: 'Admin', role: 'admin', company_id: 'c1' });
  answers = [{ status: 200, body: DASH }];
  fetchMock = vi.fn(async () => {
    const a = answers.length > 1 ? answers.shift()! : answers[0];
    if (a === 'network') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(a.body), { status: a.status });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Home', () => {
  test('shows a loader, then four tiles with each number one time', async () => {
    show();
    expect(screen.getByText("Loading today's attendance…")).toBeInTheDocument();
    const summary = await screen.findByRole('region', { name: "Today's summary" });
    const tiles = within(summary)
      .getAllByText(/^\d+$/)
      .map((n) => `${n.textContent} ${n.nextElementSibling?.textContent}`);
    expect(tiles).toEqual(['54 Guards', '16 Checked in', '3 Checked out', '35 Not checked in']);
    expect(screen.getByText(/Today · Tue 17 Nov · Updated 10:30 am/)).toBeInTheDocument();
  });

  test('groups the sites: gaps first, then upcoming; disabled sites are folded', async () => {
    show();
    const attention = await screen.findByRole('region', { name: 'Needs attention' });
    const cards = within(attention).getAllByRole('link');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Whitefield, 0 of 18 came today, 18 not checked in',
      'HSR Layout, 19 of 24 came today, 5 not checked in',
    ]);
    expect(within(screen.getByRole('region', { name: 'Upcoming' })).getByRole('link')).toHaveAccessibleName(
      'City Centre, 0 of 12 came today, Shift starts 2:00 pm',
    );
    expect(screen.queryByRole('region', { name: 'All checked in' })).not.toBeInTheDocument();
    expect(screen.getByText('1 disabled site')).toBeInTheDocument();
    // No site picker: the list is the only site control.
    expect(screen.queryByRole('button', { name: /site/i })).not.toBeInTheDocument();
  });

  test('a card opens Attendance for that location', async () => {
    show();
    await userEvent.click(await screen.findByRole('link', { name: /^Whitefield/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/attendance?location=loc-wf');
  });

  test('one location: no list, one "Mark attendance" action', async () => {
    answers = [{ status: 200, body: { ...DASH, locations: [DASH.locations[0]] } }];
    show();
    const action = await screen.findByRole('link', { name: 'Mark attendance' });
    expect(action).toHaveAttribute('href', '/attendance?location=loc-hsr');
    expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
  });

  test('no sites: admin gets "Add a site", supervisor gets a next step', async () => {
    answers = [{ status: 200, body: { ...DASH, locations: [] } }];
    const { unmount } = show();
    expect(await screen.findByRole('link', { name: 'Add a site' })).toHaveAttribute('href', '/locations');
    unmount();
    startSession('t', { id: 'supervisor.demo', name: 'Sup', role: 'supervisor', company_id: 'c1' });
    show();
    expect(await screen.findByText(/Ask an admin to give you access/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add a site' })).not.toBeInTheDocument();
  });

  test('load failure: error state with "Try again", which loads again', async () => {
    answers = [
      { status: 500, body: { detail: 'boom' } },
      { status: 200, body: DASH },
    ];
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the overview');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: "Today's summary" })).toBeInTheDocument();
  });

  test('403: no access, no "Try again"', async () => {
    answers = [{ status: 403, body: { detail: 'No access' } }];
    show();
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  test('a failed refresh keeps the data and shows a banner', async () => {
    answers = [{ status: 200, body: DASH }, 'network'];
    show();
    await screen.findByRole('region', { name: "Today's summary" });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh. Cannot reach'));
    expect(screen.getByRole('region', { name: "Today's summary" })).toBeInTheDocument();
  });
});
