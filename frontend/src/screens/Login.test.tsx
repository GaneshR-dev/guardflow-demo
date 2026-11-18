import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { clearSession, endSession } from '@/auth/session';
import { NETWORK_ERROR } from '@/lib/api';
import { Login } from './Login';

const ADMIN = { id: 'admin.demo', name: 'Admin Demo', role: 'admin', company_id: 'c1' };
const OWNER = { id: 'owner', name: 'Owner', role: 'owner', company_id: null };

type Answer = { status: number; body: unknown } | 'network' | Promise<Response>;
let loginAnswer: Answer;
let demoMode: boolean | 'fail';
let fetchMock: ReturnType<typeof vi.fn>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  clearSession();
  demoMode = true;
  loginAnswer = { status: 200, body: { token: 'tok', user: ADMIN } };
  fetchMock = vi.fn(async (path: string) => {
    if (path === '/api/health') {
      if (demoMode === 'fail') throw new TypeError('offline');
      return json(200, { status: 'ok', demo_mode: demoMode });
    }
    if (loginAnswer === 'network') throw new TypeError('Failed to fetch');
    if (loginAnswer instanceof Promise) return loginAnswer;
    return json(loginAnswer.status, loginAnswer.body);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<h1>Home screen</h1>} />
          <Route path="/owner" element={<h1>Owner screen</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const userId = () => screen.getByLabelText('User ID') as HTMLInputElement;
const password = () => screen.getByLabelText('Password') as HTMLInputElement;
const loginCalls = () => fetchMock.mock.calls.filter(([p]) => p === '/api/login');

async function signIn(id = 'admin.demo', pw = 'test-password') {
  await userEvent.type(userId(), id);
  await userEvent.type(password(), pw);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Login', () => {
  test('success saves the session and opens Home', async () => {
    show();
    await signIn();
    expect(await screen.findByRole('heading', { name: 'Home screen' })).toBeInTheDocument();
    expect(localStorage.getItem('gf_token')).toBe('tok');
    expect(JSON.parse(loginCalls()[0][1].body)).toEqual({ username: 'admin.demo', password: 'test-password' });
  });

  test('the owner opens the owner console', async () => {
    loginAnswer = { status: 200, body: { token: 'tok', user: OWNER } };
    show();
    await signIn('owner');
    expect(await screen.findByRole('heading', { name: 'Owner screen' })).toBeInTheDocument();
  });

  test('wrong password keeps the user ID, clears the password and focuses it', async () => {
    loginAnswer = { status: 401, body: { detail: 'Invalid user ID or password' } };
    show();
    await signIn('supervisor.demo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password or user ID. Try again.');
    expect(userId().value).toBe('supervisor.demo');
    expect(password().value).toBe('');
    await waitFor(() => expect(password()).toHaveFocus());
    expect(localStorage.getItem('gf_token')).toBeNull();
  });

  test.each([
    [403, 'This account has been disabled. Ask an admin to re-enable it.'],
    [429, 'Too many failed sign-in attempts. Try again later.'],
  ])('%i shows the server message and keeps the values', async (status, detail) => {
    loginAnswer = { status, body: { detail } };
    show();
    await signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent(detail);
    expect(userId().value).toBe('admin.demo');
    expect(password().value).toBe('test-password');
  });

  test('a server error shows a plain message, not the server text', async () => {
    loginAnswer = { status: 503, body: { detail: 'Service unavailable' } };
    show();
    await signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('The server had a problem. Try again in a moment.');
  });

  test('no network shows the network message', async () => {
    loginAnswer = 'network';
    show();
    await signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR);
    expect(password().value).toBe('test-password');
  });

  test('while signing in, the form is disabled and a second tap sends nothing', async () => {
    let finish!: (r: Response) => void;
    loginAnswer = new Promise<Response>((r) => (finish = r));
    show();
    await userEvent.type(userId(), 'admin.demo');
    await userEvent.type(password(), 'test-password');
    const button = screen.getByRole('button', { name: 'Sign in' });
    await userEvent.dblClick(button);
    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(userId()).toBeDisabled();
    expect(loginCalls()).toHaveLength(1);
    finish(json(200, { token: 'tok', user: ADMIN }));
    expect(await screen.findByRole('heading', { name: 'Home screen' })).toBeInTheDocument();
  });

  test('show and hide the password', async () => {
    show();
    expect(password()).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a demo account fills the form and does not sign in', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Supervisor/ }));
    expect(userId().value).toBe('supervisor.demo');
    expect(password().value).toBe('demo123');
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();
    expect(loginCalls()).toHaveLength(0);
  });

  test.each([false, 'fail' as const])('no demo box when demo_mode is %s', async (mode) => {
    demoMode = mode;
    show();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything()));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Demo access')).not.toBeInTheDocument();
  });

  test('"Forgot password?" opens the help sheet', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(await screen.findByRole('dialog', { name: 'Forgot your password?' })).toHaveTextContent(
      'Ask your admin to reset your password.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('after the server ended the session, the screen tells why', () => {
    endSession();
    show();
    expect(screen.getByRole('alert')).toHaveTextContent('Your session ended. Sign in again.');
  });
});
