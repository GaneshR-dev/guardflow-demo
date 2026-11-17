import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getSession, startSession } from '@/auth/session';
import { AppRoutes } from '@/routes';
import type { SettingsAnswer } from '@/types/api';

const SITES = [
  { id: 'loc-hsr', name: 'Bengaluru - HSR Layout', area: 'A', assigned_count: 3, active: 1 },
  { id: 'loc-wf', name: 'Bengaluru - Whitefield', area: 'B', assigned_count: 2, active: 1 },
];
const SETTINGS: SettingsAnswer = {
  profile: { id: 'admin.demo', name: 'Admin Demo', role: 'admin', company_id: 'c1' },
  company: { id: 'c1', name: 'Acme', active: 1 },
  locations: SITES,
  access: [
    { id: 'admin.demo', name: 'Admin Demo', role: 'admin', active: 1, location_ids: [] },
    { id: 'supervisor.demo', name: 'Sup Demo', role: 'supervisor', active: 1, location_ids: ['loc-hsr'] },
    { id: 'sup.two', name: 'Sup Two', role: 'supervisor', active: 0, location_ids: [] },
  ],
};
const EMPLOYEES = [
  { id: 'EMP1', name: 'A', role: 'Guard', location_id: 'loc-hsr', active: 1 },
  { id: 'EMP2', name: 'B', role: 'Guard', location_id: 'loc-hsr', active: 1 },
  { id: 'EMP3', name: 'C', role: 'Guard', location_id: 'loc-wf', active: 0 },
];
const AUDIT = {
  rows: [
    {
      at: '2026-11-17T04:00:00Z',
      user_id: 'admin.demo',
      action: 'employee.create',
      details: { employee_id: 'EMP1' },
      labels: { employee_name: 'Anil Sharma' },
    },
    {
      at: '2026-11-16T19:00:00Z',
      user_id: 'admin.demo',
      action: 'attendance.times.edit',
      details: { employee_id: 'EMP2', day: '2026-11-16', reason: 'Late fix' },
      labels: { employee_name: 'Meena P' },
    },
  ],
};

type Reply = { status: number; body: unknown };
let routes: Record<string, Reply[]>;
let fetchMock: ReturnType<typeof vi.fn>;
const key = (url: string, method = 'GET') => `${method} ${url.split('?')[0]}`;
const reply = (k: string, ...r: Reply[]) => (routes[k] = r);
const calls = (k: string) => fetchMock.mock.calls.filter(([u, o]) => key(u, o?.method) === k);

beforeEach(() => {
  startSession('t', { id: 'admin.demo', name: 'Admin Demo', role: 'admin', company_id: 'c1' });
  routes = {};
  reply('GET /api/settings', { status: 200, body: SETTINGS });
  reply('GET /api/employees', { status: 200, body: EMPLOYEES });
  reply('GET /api/audit', { status: 200, body: AUDIT });
  fetchMock = vi.fn(async (url: string, opts: RequestInit = {}) => {
    const list = routes[key(url, opts.method)];
    if (!list) throw new Error('No mock for ' + key(url, opts.method));
    const r = list.length > 1 ? list.shift()! : list[0];
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function Where() {
  const l = useLocation();
  return <output data-testid="url">{l.pathname}</output>;
}

function show(path: string) {
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

describe('Settings home', () => {
  test('Guards and Sites first, with counts; then the account rows', async () => {
    show('/settings');
    const guards = await screen.findByRole('link', { name: /^Guards/ });
    expect(guards).toHaveAttribute('href', '/employees');
    expect(guards).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: /^Sites/ })).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: /^My profile/ })).toHaveTextContent('Admin Demo · admin.demo');
    expect(screen.getByRole('link', { name: /^User access/ })).toHaveTextContent('3 users');
    expect(screen.getByRole('link', { name: /^Activity log/ })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('a supervisor has no Activity log', async () => {
    asSupervisor();
    show('/settings');
    await screen.findByRole('link', { name: /^Guards/ });
    expect(screen.queryByRole('link', { name: /^Activity log/ })).not.toBeInTheDocument();
  });

  test('the Guards count shows "–" when only that request fails', async () => {
    reply('GET /api/employees', { status: 500, body: { detail: 'x' } });
    show('/settings');
    expect(await screen.findByRole('link', { name: /^Sites/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: /^Guards/ })).toHaveTextContent('–'));
  });

  test('a load error shows "Try again"', async () => {
    reply('GET /api/settings', { status: 500, body: { detail: 'x' } }, { status: 200, body: SETTINGS });
    show('/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /^Sites/ })).toBeInTheDocument();
  });

  test('Sign out ends the session', async () => {
    reply('POST /api/logout', { status: 200, body: {} });
    show('/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(getSession().token).toBe(''));
  });
});

describe('My profile', () => {
  test('Save is disabled until the name changes; the new name goes to the session', async () => {
    reply('PATCH /api/settings/profile', { status: 200, body: { id: 'admin.demo', name: 'Admin Two', role: 'admin' } });
    show('/settings/profile');
    const name = await screen.findByLabelText('Name');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Admin Two');
    await userEvent.dblClick(save);
    await waitFor(() => expect(getSession().user?.name).toBe('Admin Two'));
    expect(calls('PATCH /api/settings/profile')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings');
  });

  test('a 422 shows under the field and keeps the typed name', async () => {
    reply('PATCH /api/settings/profile', { status: 422, body: { detail: [{ msg: 'Name is too short' }] } });
    show('/settings/profile');
    const name = await screen.findByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Zed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is too short');
    expect(name).toHaveValue('Zed');
  });
});

describe('User access', () => {
  test('admin: supervisors open; the admin row does not; sites text', async () => {
    show('/settings/access');
    const sup = await screen.findByRole('link', { name: /Sup Demo/ });
    expect(sup).toHaveAttribute('href', '/settings/access/supervisor.demo');
    expect(sup).toHaveTextContent('HSR Layout');
    expect(screen.getByRole('link', { name: /Sup Two/ })).toHaveTextContent('No sites');
    expect(screen.queryByRole('link', { name: /^AD/ })).not.toBeInTheDocument();
    expect(screen.getByText('All sites')).toBeInTheDocument();
  });

  test('supervisor: read-only list', async () => {
    asSupervisor();
    show('/settings/access');
    expect(await screen.findByText('Only admins can change access.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a supervisor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sup Demo/ })).not.toBeInTheDocument();
  });

  test('add a supervisor: one request for a double tap, the sites go with it', async () => {
    reply('POST /api/settings/access', { status: 200, body: {} });
    show('/settings/access');
    await userEvent.click(await screen.findByRole('button', { name: 'Add a supervisor' }));
    const sheet = await screen.findByRole('dialog', { name: 'Add a supervisor' });
    await userEvent.type(within(sheet).getByLabelText('User ID'), 'sup.new');
    await userEvent.type(within(sheet).getByLabelText('Name'), 'New Sup');
    await userEvent.type(within(sheet).getByLabelText('Password'), 'test-pass-123');
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Whitefield/ }));
    await userEvent.dblClick(within(sheet).getByRole('button', { name: 'Add supervisor' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls('POST /api/settings/access')).toHaveLength(1);
    expect(JSON.parse(calls('POST /api/settings/access')[0][1].body)).toEqual({
      id: 'sup.new',
      name: 'New Sup',
      password: 'test-pass-123',
      role: 'supervisor',
      location_ids: ['loc-wf'],
    });
  });

  test('a 409 (user ID in use) stays in the sheet with the values', async () => {
    reply('POST /api/settings/access', { status: 409, body: { detail: 'User ID already exists' } });
    show('/settings/access');
    await userEvent.click(await screen.findByRole('button', { name: 'Add a supervisor' }));
    const sheet = await screen.findByRole('dialog', { name: 'Add a supervisor' });
    await userEvent.type(within(sheet).getByLabelText('User ID'), 'supervisor.demo');
    await userEvent.type(within(sheet).getByLabelText('Name'), 'Dup');
    await userEvent.type(within(sheet).getByLabelText('Password'), 'test-pass-123');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add supervisor' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('User ID already exists');
    expect(within(sheet).getByLabelText('User ID')).toHaveValue('supervisor.demo');
  });
});

describe('One user', () => {
  test('save sites: disabled until a change; a note for sites with no supervisor', async () => {
    reply('PATCH /api/settings/access/supervisor.demo/locations', {
      status: 200,
      body: { id: 'supervisor.demo', unsupervised: ['loc-hsr'] },
    });
    show('/settings/access/supervisor.demo');
    const save = await screen.findByRole('button', { name: 'Save sites' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /HSR Layout/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Whitefield/ }));
    await userEvent.click(save);
    await waitFor(() => expect(calls('PATCH /api/settings/access/supervisor.demo/locations')).toHaveLength(1));
    expect(JSON.parse(calls('PATCH /api/settings/access/supervisor.demo/locations')[0][1].body)).toEqual({
      location_ids: ['loc-wf'],
    });
  });

  test('set a new password', async () => {
    reply('POST /api/settings/access/supervisor.demo/password', { status: 200, body: {} });
    show('/settings/access/supervisor.demo');
    await userEvent.click(await screen.findByRole('button', { name: 'Set a new password' }));
    const sheet = await screen.findByRole('dialog', { name: 'New password · Sup Demo' });
    await userEvent.type(within(sheet).getByLabelText('New password'), 'another-pass-1');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(calls('POST /api/settings/access/supervisor.demo/password')[0][1].body)).toEqual({
      password: 'another-pass-1',
    });
  });

  test('disable access asks first', async () => {
    reply('DELETE /api/settings/access/supervisor.demo', {
      status: 200,
      body: { id: 'supervisor.demo', unsupervised: [] },
    });
    show('/settings/access/supervisor.demo');
    await userEvent.click(await screen.findByRole('button', { name: 'Disable access' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disable access?' });
    expect(calls('DELETE /api/settings/access/supervisor.demo')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(calls('DELETE /api/settings/access/supervisor.demo')).toHaveLength(1));
  });

  test('a disabled user can be enabled', async () => {
    reply('POST /api/settings/access/sup.two/enable', { status: 200, body: { id: 'sup.two' } });
    show('/settings/access/sup.two');
    await userEvent.click(await screen.findByRole('button', { name: 'Enable access' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(calls('POST /api/settings/access/sup.two/enable')).toHaveLength(1));
  });

  test('an unknown user: "User not found" with a way back', async () => {
    show('/settings/access/nobody');
    expect(await screen.findByRole('heading', { name: 'User not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show all users' })).toHaveAttribute('href', '/settings/access');
    expect(screen.getByRole('link', { name: 'Back to User access' })).toHaveAttribute('href', '/settings/access');
  });
});

describe('Activity log', () => {
  test('titles use the glossary words; dates are IST; export downloads the file', async () => {
    reply('GET /api/audit/export', { status: 200, body: 'at,user_id\n' });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    show('/settings/activity');
    expect(await screen.findByText('Guard added')).toBeInTheDocument();
    expect(screen.getByText('Meena P · 2026-11-16 · Reason: Late fix')).toBeInTheDocument();
    // 19:00 UTC on 16 Nov is 00:30 IST on 17 Nov.
    expect(screen.getByText('admin.demo · Tue 17 Nov, 12:30 am')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export the activity log (CSV)' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(calls('GET /api/audit/export')).toHaveLength(1);
  });

  test('a supervisor gets "No access"', async () => {
    asSupervisor();
    reply('GET /api/audit', { status: 403, body: { detail: 'Admin required' } });
    show('/settings/activity');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
  });
});
