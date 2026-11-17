// The one fetch wrapper. Call the backend only with api(). It adds the session token, reads
// JSON and turns each failure into an ApiError with a readable message.
import { endSession, getSession, SESSION_ENDED } from '@/auth/session';

export class ApiError extends Error {
  status: number;
  network: boolean;
  constructor(message: string, status = 0, network = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.network = network;
  }
}

export const NETWORK_ERROR = 'Cannot reach the Guardian server. Check the connection and try again.';
export const LOGIN_FAILED = 'Wrong password or user ID. Try again.';

// Server errors (5xx) can hold internal text. Show a plain message instead.
export const friendlyError = (status: number, message: string) =>
  status >= 500 ? 'The server had a problem. Try again in a moment.' : message;

// A promise that never settles. A reply that comes after the session changed belongs to the
// old account, so it must not reach the screens of the new session.
const never = <T>() => new Promise<T>(() => {});

type Detail = string | { msg?: string; message?: string }[] | undefined;

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const { token, companyId } = getSession();
  const isLogin = path === '/api/login';
  const isLogout = path === '/api/logout';
  const stale = () => !isLogin && !isLogout && getSession().token !== token;
  let res: Response;
  try {
    res = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(token && companyId && !path.startsWith('/api/owner/') ? { 'X-Company-Id': companyId } : {}),
        ...opts.headers,
      },
    });
  } catch {
    if (stale()) return never();
    throw new ApiError(NETWORK_ERROR, 0, true);
  }
  const text = await res.text();
  if (stale()) return never();
  let data: { detail?: Detail } & Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    if (isLogin && res.status === 401) throw new ApiError(LOGIN_FAILED, 401);
    // Any other 401 means the server no longer accepts this session (expired, revoked or
    // signed out on another device). /api/logout handles its own 401.
    if (res.status === 401 && !isLogout) {
      endSession();
      throw new ApiError(SESSION_ENDED, 401);
    }
    const detail = Array.isArray(data.detail)
      ? data.detail.map((x) => x.msg || x.message || String(x)).join('; ')
      : data.detail;
    throw new ApiError(detail || 'Request failed', res.status);
  }
  return data as T;
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
