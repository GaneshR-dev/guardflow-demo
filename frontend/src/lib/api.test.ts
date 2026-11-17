import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getSession, SESSION_ENDED, selectCompany, startSession } from '@/auth/session';
import { api, ApiError, friendlyError, LOGIN_FAILED, NETWORK_ERROR } from './api';

const USER = { id: 'admin.demo', name: 'Admin Demo', role: 'admin' as const, company_id: 'c1' };

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  startSession('tok-1', USER);
});
afterEach(() => vi.unstubAllGlobals());

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected a failure');
};

describe('api()', () => {
  test('sends the token and returns JSON', async () => {
    fetchMock.mockReturnValue(reply(200, { ok: 1 }));
    await expect(api('/api/locations')).resolves.toEqual({ ok: 1 });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer tok-1');
    expect(headers['X-Company-Id']).toBeUndefined();
  });

  test('sends X-Company-Id when a company is selected, but not to owner endpoints', async () => {
    selectCompany('c9', 'Acme');
    fetchMock.mockImplementation(() => reply(200, {}));
    await api('/api/locations');
    await api('/api/owner/companies');
    expect(fetchMock.mock.calls[0][1].headers['X-Company-Id']).toBe('c9');
    expect(fetchMock.mock.calls[1][1].headers['X-Company-Id']).toBeUndefined();
  });

  test('no network gives a readable message', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await failure(api('/api/locations'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.network).toBe(true);
    expect(err.message).toBe(NETWORK_ERROR);
  });

  test('401 on sign-in keeps the session and says wrong password', async () => {
    fetchMock.mockReturnValue(reply(401, { detail: 'Invalid user ID or password' }));
    const err = await failure(api('/api/login', { method: 'POST' }));
    expect(err.status).toBe(401);
    expect(err.message).toBe(LOGIN_FAILED);
  });

  test('401 on other requests ends the session', async () => {
    fetchMock.mockReturnValue(reply(401, { detail: 'Session expired' }));
    const err = await failure(api('/api/locations'));
    expect(err.status).toBe(401);
    expect(err.message).toBe(SESSION_ENDED);
    expect(getSession().token).toBe('');
    expect(getSession().endedMessage).toBe(SESSION_ENDED);
    expect(localStorage.getItem('gf_token')).toBeNull();
  });

  test('403 and 404 keep the server detail and status', async () => {
    fetchMock.mockReturnValueOnce(reply(403, { detail: 'No access to this location' }));
    fetchMock.mockReturnValueOnce(reply(404, { detail: 'Location not found' }));
    const e403 = await failure(api('/api/attendance'));
    const e404 = await failure(api('/api/attendance'));
    expect([e403.status, e403.message]).toEqual([403, 'No access to this location']);
    expect([e404.status, e404.message]).toEqual([404, 'Location not found']);
    expect(getSession().token).toBe('tok-1');
  });

  test('422 joins the field messages', async () => {
    fetchMock.mockReturnValue(reply(422, { detail: [{ msg: 'Name is too short' }, { msg: 'Phone is not valid' }] }));
    const err = await failure(api('/api/employees', { method: 'POST' }));
    expect(err.status).toBe(422);
    expect(err.message).toBe('Name is too short; Phone is not valid');
  });

  test('a non-JSON server error keeps its status, and friendlyError hides 5xx text', async () => {
    fetchMock.mockReturnValue(reply(500, 'Internal Server Error'));
    const err = await failure(api('/api/locations'));
    expect(err.status).toBe(500);
    expect(friendlyError(err.status, err.message)).toBe('The server had a problem. Try again in a moment.');
    expect(friendlyError(409, 'Already checked in')).toBe('Already checked in');
  });

  test('a reply after the session changed is dropped', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const settled = vi.fn();
    api('/api/locations').then(settled, settled);
    startSession('tok-2', USER);
    resolve(new Response('{}', { status: 200 }));
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).not.toHaveBeenCalled();
  });
});
