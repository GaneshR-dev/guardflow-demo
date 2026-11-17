import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startSession } from '@/auth/session';
import { AppRoutes } from '@/routes';

const SITES = [
  {
    id: 'loc-hsr',
    name: 'Bengaluru - HSR Layout',
    area: 'HSR Sector 2',
    assigned_count: 24,
    disabled_count: 2,
    active: 1,
    shifts: [
      { label: null, shift_start: '09:00', shift_end: '18:00' },
      { label: 'Night', shift_start: '22:00', shift_end: '06:00' },
    ],
  },
  { id: 'loc-wf', name: 'Bengaluru - Whitefield', area: 'ITPL', assigned_count: 18, active: 1, shifts: [] },
  { id: 'loc-old', name: 'Mysuru - Old Gate', area: 'Centre', assigned_count: 0, active: 0, shifts: [] },
];
const SETTINGS = {
  profile: { id: 'admin.demo', name: 'Admin Demo', role: 'admin', company_id: 'c1' },
  company: { id: 'c1', name: 'Acme', active: 1 },
  locations: SITES,
  access: [
    { id: 'admin.demo', name: 'Admin Demo', role: 'admin', active: 1, location_ids: [] },
    { id: 'supervisor.demo', name: 'Sup Demo', role: 'supervisor', active: 1, location_ids: ['loc-hsr'] },
    { id: 'sup.off', name: 'Sup Off', role: 'supervisor', active: 0, location_ids: [] },
  ],
};

type Reply = { status: number; body: unknown };
let routes: Record<string, Reply[]>;
let fetchMock: ReturnType<typeof vi.fn>;
const key = (url: string, method = 'GET') => `${method} ${url.split('?')[0]}`;
const reply = (k: string, ...r: Reply[]) => (routes[k] = r);
const calls = (k: string) => fetchMock.mock.calls.filter(([u, o]) => key(u, o?.method) === k);
const body = (k: string, i = 0) => JSON.parse(calls(k)[i][1].body);

beforeEach(() => {
  startSession('t', { id: 'admin.demo', name: 'Admin Demo', role: 'admin', company_id: 'c1' });
  routes = {};
  reply('GET /api/locations', { status: 200, body: SITES });
  reply('GET /api/settings', { status: 200, body: SETTINGS });
  fetchMock = vi.fn(async (url: string, opts: RequestInit = {}) => {
    const list = routes[key(url, opts.method)];
    if (!list) throw new Error('No mock for ' + key(url, opts.method));
    const r = list.length > 1 ? list.shift()! : list[0];
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function Where() {
  const l = useLocation();
  return <output data-testid="url">{l.pathname + l.search}</output>;
}

function show(path = '/locations') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const asSupervisor = () =>
  startSession('t', { id: 'supervisor.demo', name: 'Sup Demo', role: 'supervisor', company_id: 'c1' });

describe('Sites list', () => {
  test('shows the active sites and folds the disabled sites', async () => {
    show();
    expect(screen.getByText('Loading the sites…')).toBeInTheDocument();
    await screen.findByText('2 sites');
    const hsr = screen.getByRole('link', { name: /HSR Layout/ });
    expect(hsr).toHaveAttribute('href', '/locations/loc-hsr');
    expect(hsr).toHaveTextContent('Bengaluru · HSR Sector 2');
    expect(hsr).toHaveTextContent('24 active guards · 2 disabled · 2 shifts');
    expect(screen.getByText('1 disabled site').closest('details')).not.toHaveAttribute('open');
    expect(calls('GET /api/locations')).toHaveLength(1);
  });

  test('search by name or area, and clear it', async () => {
    show();
    await screen.findByText('2 sites');
    const box = screen.getByRole('searchbox', { name: 'Search sites by name or area' });
    await userEvent.type(box, 'itpl');
    expect(screen.getByText('1 site found')).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'centre');
    expect(screen.getByText('1 disabled site').closest('details')).toHaveAttribute('open');
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(box).toHaveValue('');
  });

  test('a supervisor only reads', async () => {
    asSupervisor();
    show('/locations?add=1');
    await screen.findByText('2 sites');
    expect(screen.queryByRole('button', { name: 'Add a site' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Import sites from a CSV file')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Only admins can change sites.')).toBeInTheDocument();
  });

  test('no sites: an admin can add one', async () => {
    reply('GET /api/locations', { status: 200, body: [] });
    show();
    await screen.findByRole('heading', { name: 'No sites yet' });
    // The icon at the top right and the button in the empty state.
    const buttons = screen.getAllByRole('button', { name: 'Add a site' });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]);
    expect(await screen.findByRole('dialog', { name: 'Add a site' })).toBeInTheDocument();
  });

  test('a load error shows "Try again"', async () => {
    reply('GET /api/locations', { status: 500, body: { detail: 'boom' } }, { status: 200, body: SITES });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText('2 sites');
  });

  test('import sends the rows', async () => {
    reply('POST /api/settings/locations/import', { status: 200, body: { created: 1, updated: 1 } });
    show();
    await screen.findByText('2 sites');
    await userEvent.upload(
      screen.getByLabelText('Import sites from a CSV file'),
      new File(['id,name,area\nloc-wf,Bengaluru - Whitefield,ITPL\n,Pune - Baner,Baner Road\n'], 's.csv'),
    );
    await waitFor(() => expect(calls('POST /api/settings/locations/import')).toHaveLength(1));
    expect(body('POST /api/settings/locations/import').rows).toEqual([
      { id: 'loc-wf', name: 'Bengaluru - Whitefield', area: 'ITPL', assigned_count: 0 },
      { id: null, name: 'Pune - Baner', area: 'Baner Road', assigned_count: 0 },
    ]);
  });
});

describe('Add a site', () => {
  test('?add=1 opens the sheet; the site gets shifts and a supervisor; then the site opens', async () => {
    reply('POST /api/settings/locations', { status: 200, body: { id: 'loc-pune-baner' } });
    show('/locations?add=1');
    const sheet = await screen.findByRole('dialog', { name: 'Add a site' });
    await userEvent.type(within(sheet).getByLabelText('Name'), 'Pune - Baner');
    await userEvent.type(within(sheet).getByLabelText('Area'), 'Baner Road');
    await userEvent.type(within(sheet).getByLabelText('Start time'), '22:00');
    // A half shift row blocks the save.
    const add = within(sheet).getByRole('button', { name: 'Add site' });
    expect(add).toBeDisabled();
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Add both times for shift 1, or remove it.');
    await userEvent.type(within(sheet).getByLabelText('End time'), '06:00');
    expect(within(sheet).getByText('Ends the next day.')).toBeInTheDocument();
    // Only active supervisors are choices.
    const supervisor = within(sheet).getByLabelText('Supervisor');
    expect(within(supervisor).queryByRole('option', { name: 'Sup Off' })).not.toBeInTheDocument();
    await userEvent.selectOptions(supervisor, 'supervisor.demo');
    await userEvent.dblClick(add);
    await waitFor(() => expect(calls('POST /api/settings/locations')).toHaveLength(1));
    expect(body('POST /api/settings/locations')).toEqual({
      name: 'Pune - Baner',
      area: 'Baner Road',
      shifts: [{ label: null, shift_start: '22:00', shift_end: '06:00' }],
      supervisor_id: 'supervisor.demo',
    });
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/locations/loc-pune-baner'));
  });

  test('"Leave unassigned" sends no supervisor; a duplicate shift is blocked', async () => {
    reply('POST /api/settings/locations', { status: 200, body: { id: 'loc-x' } });
    show('/locations?add=1');
    const sheet = await screen.findByRole('dialog', { name: 'Add a site' });
    await userEvent.type(within(sheet).getByLabelText('Name'), 'Pune - Wakad');
    await userEvent.type(within(sheet).getByLabelText('Area'), 'Wakad');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add a shift' }));
    const starts = within(sheet).getAllByLabelText('Start time');
    const ends = within(sheet).getAllByLabelText('End time');
    for (const i of [0, 1]) {
      await userEvent.type(starts[i], '09:00');
      await userEvent.type(ends[i], '18:00');
    }
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Shift 2 is the same as shift 1.');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove shift 2' }));
    await userEvent.selectOptions(within(sheet).getByLabelText('Supervisor'), 'Leave unassigned');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add site' }));
    await waitFor(() => expect(calls('POST /api/settings/locations')).toHaveLength(1));
    expect(body('POST /api/settings/locations').supervisor_id).toBeNull();
    expect(body('POST /api/settings/locations').shifts).toHaveLength(1);
  });
});

describe('Site screen', () => {
  test('shows the shifts, the guards link and "Mark attendance here"', async () => {
    show('/locations/loc-hsr');
    expect(await screen.findByRole('heading', { name: 'HSR Layout' })).toBeInTheDocument();
    expect(screen.getByText('Bengaluru · HSR Sector 2')).toBeInTheDocument();
    const shifts = screen.getByRole('region', { name: 'Shifts' });
    expect(shifts).toHaveTextContent('9:00 am – 6:00 pm IST');
    expect(shifts).toHaveTextContent('10:00 pm – 6:00 am IST · Ends the next day');
    expect(screen.getByRole('link', { name: /Guards/ })).toHaveAttribute('href', '/employees?site=loc-hsr');
    expect(screen.getByRole('link', { name: /Guards/ })).toHaveTextContent('2 disabled guards');
    expect(screen.getByRole('link', { name: 'Mark attendance here' })).toHaveAttribute(
      'href',
      '/attendance?location=loc-hsr',
    );
  });

  test('an unknown site shows "Site not found"', async () => {
    show('/locations/loc-gone');
    expect(await screen.findByRole('heading', { name: 'Site not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sites' })).toHaveAttribute('href', '/locations');
  });

  test('a supervisor only reads', async () => {
    asSupervisor();
    show('/locations/loc-hsr');
    await screen.findByRole('heading', { name: 'HSR Layout' });
    expect(screen.queryByRole('button', { name: 'Edit site' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit shifts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable site' })).not.toBeInTheDocument();
  });

  test('edit site: Save waits for a change and sends one PATCH', async () => {
    reply('PATCH /api/settings/locations/loc-hsr', { status: 200, body: { id: 'loc-hsr' } });
    show('/locations/loc-hsr');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit site' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit site' });
    const save = within(sheet).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(within(sheet).queryByLabelText('Supervisor')).not.toBeInTheDocument();
    await userEvent.clear(within(sheet).getByLabelText('Area'));
    await userEvent.type(within(sheet).getByLabelText('Area'), 'HSR Sector 3');
    await userEvent.dblClick(save);
    await waitFor(() => expect(calls('PATCH /api/settings/locations/loc-hsr')).toHaveLength(1));
    expect(body('PATCH /api/settings/locations/loc-hsr')).toEqual({
      name: 'Bengaluru - HSR Layout',
      area: 'HSR Sector 3',
    });
  });

  test('edit shifts: keeps the labels and sends the new list', async () => {
    reply('PUT /api/settings/locations/loc-hsr/shifts', { status: 200, body: {} });
    show('/locations/loc-hsr');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shifts' }));
    const sheet = await screen.findByRole('dialog', { name: /Edit shifts/ });
    expect(within(sheet).getByRole('button', { name: 'Save shifts' })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove shift 1' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save shifts' }));
    await waitFor(() => expect(calls('PUT /api/settings/locations/loc-hsr/shifts')).toHaveLength(1));
    expect(body('PUT /api/settings/locations/loc-hsr/shifts')).toEqual({
      shifts: [{ label: 'Night', shift_start: '22:00', shift_end: '06:00' }],
    });
  });

  test('a site with no shift: an admin can add shifts', async () => {
    show('/locations/loc-wf');
    await screen.findByText('No shift set.');
    expect(screen.getByRole('button', { name: 'Add shifts' })).toBeInTheDocument();
  });

  test('disable asks first and shows a server error in the dialog', async () => {
    reply(
      'DELETE /api/settings/locations/loc-hsr',
      { status: 409, body: { detail: 'Cannot disable this site yet: 2 guards are still checked in.' } },
      { status: 200, body: { id: 'loc-hsr', status: 'disabled' } },
    );
    show('/locations/loc-hsr');
    await userEvent.click(await screen.findByRole('button', { name: 'Disable site' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disable HSR Layout?' });
    expect(dialog).toHaveTextContent('Supervisors keep seeing it. History is kept.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disable site' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('still checked in');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disable site' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls('DELETE /api/settings/locations/loc-hsr')).toHaveLength(2);
  });

  test('a disabled site: one tap enables it; no "Mark attendance here"', async () => {
    reply('POST /api/settings/locations/loc-old/enable', { status: 200, body: { status: 'active' } });
    show('/locations/loc-old');
    await screen.findByText('Enable this site to mark attendance here again.');
    expect(screen.queryByRole('link', { name: 'Mark attendance here' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enable site' }));
    await waitFor(() => expect(calls('POST /api/settings/locations/loc-old/enable')).toHaveLength(1));
  });
});
