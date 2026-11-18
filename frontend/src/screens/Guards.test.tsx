import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startSession } from '@/auth/session';
import { AppRoutes } from '@/routes';

const SITES = [
  { id: 'loc-hsr', name: 'Bengaluru - HSR Layout', area: 'A', assigned_count: 2, active: 1 },
  { id: 'loc-wf', name: 'Bengaluru - Whitefield', area: 'B', assigned_count: 1, active: 1 },
  { id: 'loc-old', name: 'Bengaluru - Old Site', area: 'C', assigned_count: 0, active: 0 },
];
const GUARDS = [
  { id: 'EMP1001', name: 'Anil Sharma', phone: '+91 90000 11001', role: 'Guard', location_id: 'loc-hsr', active: 1 },
  { id: 'EMP1002', name: 'Meena Pillai', phone: '+91 90000 11002', role: 'Guard', location_id: 'loc-hsr', active: 1 },
  { id: 'EMP2001', name: 'Ravi Kumar', phone: '+91 90000 12001', role: 'Guard', location_id: 'loc-wf', active: 1 },
  { id: 'EMP3001', name: 'Nisha Das', phone: '+91 90000 13001', role: 'Guard', location_id: null, active: 1 },
  { id: 'EMP4001', name: 'Old Guard', phone: '+91 90000 14001', role: 'Guard', location_id: 'loc-wf', active: 0 },
  { id: 'EMP5001', name: 'Closed Site', phone: '+91 90000 15001', role: 'Guard', location_id: 'loc-old', active: 0 },
];

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
  reply('GET /api/employees', { status: 200, body: GUARDS });
  reply('GET /api/locations', { status: 200, body: SITES });
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

function show(path = '/employees') {
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
const list = () => screen.getByRole('region', { name: 'Guards' });
const cardNames = () =>
  within(list())
    .getAllByRole('listitem')
    .map((li) => li.querySelector('strong')?.firstChild?.textContent);

describe('Guards list', () => {
  test('shows the active guards with their site, and folds the disabled guards', async () => {
    show();
    expect(screen.getByText('Loading the guards…')).toBeInTheDocument();
    await screen.findByText('4 guards');
    expect(screen.getByRole('heading', { name: 'Guards' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Anil Sharma, EMP1001, HSR Layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit Nisha Das, EMP3001, No site yet/ })).toBeInTheDocument();
    const folded = screen.getByText('2 disabled guards').closest('details')!;
    expect(folded).not.toHaveAttribute('open');
    expect(within(folded).getByRole('button', { name: 'Enable Old Guard' })).toBeInTheDocument();
    // A guard at a disabled site: no Enable button, a note instead.
    expect(within(folded).queryByRole('button', { name: 'Enable Closed Site' })).not.toBeInTheDocument();
    expect(within(folded).getByText('Enable the site first.')).toBeInTheDocument();
    expect(calls('GET /api/employees')).toHaveLength(1);
  });

  test('the site filter is in the URL; a stale site shows all sites', async () => {
    show('/employees?site=loc-wf');
    await screen.findByText('1 guard');
    // One site: the cards do not repeat the site name.
    expect(screen.getByRole('button', { name: 'Edit Ravi Kumar, EMP2001' })).toHaveTextContent(/^RKRavi KumarEMP2001$/);
    await userEvent.click(screen.getByRole('button', { name: 'Change site, now Whitefield' }));
    await userEvent.click(screen.getByRole('radio', { name: /No site yet/ }));
    expect(screen.getByTestId('url')).toHaveTextContent('/employees?site=none');
    expect(cardNames()).toEqual(['Nisha Das']);
  });

  test('an unknown site in the URL shows all sites', async () => {
    show('/employees?site=loc-gone');
    await screen.findByText('4 guards');
    expect(screen.getByRole('button', { name: 'Change site, now All sites' })).toBeInTheDocument();
  });

  test('search finds by name or ID, opens the disabled matches, and can be cleared', async () => {
    show();
    await screen.findByText('4 guards');
    const box = screen.getByRole('searchbox', { name: 'Search guards by name or guard ID' });
    await userEvent.type(box, 'old');
    expect(screen.getByText('1 guard found')).toBeInTheDocument();
    expect(screen.getByText('1 disabled guard').closest('details')).toHaveAttribute('open');
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    expect(screen.getByRole('heading', { name: 'No guards match "zzz"' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(box).toHaveValue('');
    await userEvent.type(box, 'emp2001');
    expect(cardNames()).toEqual(['Ravi Kumar']);
  });

  test('Enable sends one request', async () => {
    reply('POST /api/employees/EMP4001/enable', { status: 200, body: { id: 'EMP4001', status: 'active' } });
    show();
    await screen.findByText('4 guards');
    await userEvent.click(screen.getByText('2 disabled guards'));
    await userEvent.click(screen.getByRole('button', { name: 'Enable Old Guard' }));
    await waitFor(() => expect(calls('POST /api/employees/EMP4001/enable')).toHaveLength(1));
    await waitFor(() => expect(calls('GET /api/employees')).toHaveLength(2));
  });

  test('a supervisor only reads: no add, import, edit or "No site yet"', async () => {
    asSupervisor();
    show('/employees?site=none');
    await screen.findByText('4 guards');
    expect(screen.queryByRole('button', { name: 'Add a guard' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Import guards from a CSV file')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Enable / })).not.toBeInTheDocument();
    expect(screen.getByText('Only admins can change guards.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change site, now All sites' }));
    expect(screen.queryByRole('radio', { name: /No site yet/ })).not.toBeInTheDocument();
  });

  test('a load error shows "Try again" and keeps the filter', async () => {
    reply('GET /api/employees', { status: 500, body: { detail: 'boom' } }, { status: 200, body: GUARDS });
    show('/employees?site=loc-hsr');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText('2 guards');
    expect(screen.getByTestId('url')).toHaveTextContent('site=loc-hsr');
  });

  test('no guards at all: an empty state with "Add a guard"', async () => {
    reply('GET /api/employees', { status: 200, body: [] });
    show();
    expect(await screen.findByRole('heading', { name: 'No guards yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add a guard' })).toHaveLength(2);
  });
});

describe('Add and edit a guard', () => {
  test('add: the site in the filter is the default site', async () => {
    reply('POST /api/employees', { status: 200, body: { id: 'EMP9000' } });
    show('/employees?site=loc-wf');
    await screen.findByText('1 guard');
    await userEvent.click(screen.getByRole('button', { name: 'Add a guard' }));
    const sheet = await screen.findByRole('dialog', { name: 'Add a guard' });
    expect(within(sheet).getByLabelText('Site')).toHaveValue('loc-wf');
    // A disabled site is not a choice.
    expect(within(sheet).queryByRole('option', { name: 'Old Site' })).not.toBeInTheDocument();
    await userEvent.type(within(sheet).getByLabelText('Name'), 'New Guard');
    await userEvent.type(within(sheet).getByLabelText('Phone'), '+91 98000 00000');
    await userEvent.dblClick(within(sheet).getByRole('button', { name: 'Add guard' }));
    await waitFor(() => expect(calls('POST /api/employees')).toHaveLength(1));
    expect(body('POST /api/employees')).toEqual({ name: 'New Guard', phone: '+91 98000 00000', location_id: 'loc-wf' });
  });

  test('edit: Save waits for a change; a site change shows a note and sends one PATCH', async () => {
    reply('PATCH /api/employees/EMP1001', { status: 200, body: { id: 'EMP1001' } });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Anil Sharma, EMP1001, HSR Layout' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit Anil Sharma' });
    expect(within(sheet).getByLabelText('Phone')).toHaveValue('+91 90000 11001');
    const save = within(sheet).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.selectOptions(within(sheet).getByLabelText('Site'), 'loc-wf');
    expect(within(sheet).getByText('The attendance history stays at the old site.')).toBeInTheDocument();
    await userEvent.dblClick(save);
    await waitFor(() => expect(calls('PATCH /api/employees/EMP1001')).toHaveLength(1));
    expect(body('PATCH /api/employees/EMP1001')).toEqual({
      name: 'Anil Sharma',
      phone: '+91 90000 11001',
      location_id: 'loc-wf',
    });
  });

  test('edit: a server error stays in the sheet with the typed values', async () => {
    reply('PATCH /api/employees/EMP1001', {
      status: 409,
      body: { detail: 'This guard is checked in. Record their check-out first, then move the guard.' },
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Edit Anil Sharma/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit Anil Sharma' });
    await userEvent.selectOptions(within(sheet).getByLabelText('Site'), '');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Record their check-out first');
    expect(within(sheet).getByLabelText('Site')).toHaveValue('');
  });

  test('disable: asks first; a server error stays in the dialog', async () => {
    reply(
      'DELETE /api/employees/EMP1001',
      { status: 409, body: { detail: 'Cannot disable this guard yet: the guard is still checked in.' } },
      { status: 200, body: { id: 'EMP1001', status: 'disabled' } },
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Edit Anil Sharma/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Disable guard' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disable Anil Sharma?' });
    expect(dialog).toHaveTextContent('History is kept.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disable guard' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('still checked in');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disable guard' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls('DELETE /api/employees/EMP1001')).toHaveLength(2);
  });
});

describe('Import guards', () => {
  const file = (text: string) => new File([text], 'guards.csv', { type: 'text/csv' });

  test('sends the rows; an empty site gets the site in the filter; warnings show', async () => {
    reply('POST /api/employees/import', {
      status: 200,
      body: { created: 1, updated: 1, warnings: ['EMP9001: Anil Sharma (EMP1001) already has this phone number.'] },
    });
    show('/employees?site=loc-hsr');
    await screen.findByText('2 guards');
    await userEvent.upload(
      screen.getByLabelText('Import guards from a CSV file'),
      file('id,name,phone,location_id\nEMP9001,"Rao, Ananya",+91 90000 11001,\n,Ravi B,+91 91111 22222,loc-wf\n'),
    );
    await waitFor(() => expect(calls('POST /api/employees/import')).toHaveLength(1));
    expect(body('POST /api/employees/import').rows).toEqual([
      { id: 'EMP9001', name: 'Rao, Ananya', phone: '+91 90000 11001', role: 'Guard', location_id: 'loc-hsr' },
      { id: null, name: 'Ravi B', phone: '+91 91111 22222', role: 'Guard', location_id: 'loc-wf' },
    ]);
    expect(await screen.findByText(/already has this phone number/)).toBeInTheDocument();
  });

  test('a file with no rows shows an error and sends nothing', async () => {
    show();
    await screen.findByText('4 guards');
    await userEvent.upload(screen.getByLabelText('Import guards from a CSV file'), file('name,phone\n'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The file needs a header row and at least one guard.');
    expect(calls('POST /api/employees/import')).toHaveLength(0);
  });
});
