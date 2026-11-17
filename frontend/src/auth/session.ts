// The signed-in session. It uses the same localStorage keys as the old app, so a session
// made in /app also works in /next on the same server.
import { useSyncExternalStore } from 'react';
import type { Role, User } from '@/types/api';

export const SESSION_ENDED = 'Your session ended. Sign in again.';

export interface Session {
  token: string;
  user: User | null;
  companyId: string;
  companyName: string;
  // Message for the sign-in screen after the server refused the session.
  endedMessage: string;
}

const KEYS = { token: 'gf_token', user: 'gf_user', company: 'gf_company' } as const;

// localStorage can throw (private mode, blocked storage). The app then works without a saved session.
function read(key: string) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage is blocked. The session stays in memory only.
  }
}
function readUser(): User | null {
  try {
    return JSON.parse(read(KEYS.user) || 'null') as User | null;
  } catch {
    return null;
  }
}

let current: Session = {
  token: read(KEYS.token),
  user: readUser(),
  companyId: read(KEYS.company),
  companyName: '',
  endedMessage: '',
};
const listeners = new Set<() => void>();

function set(next: Session) {
  current = next;
  write(KEYS.token, next.token);
  write(KEYS.user, next.user ? JSON.stringify(next.user) : '');
  write(KEYS.company, next.companyId);
  listeners.forEach((l) => l());
}

export const getSession = () => current;

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession);
}

export function startSession(token: string, user: User) {
  set({ token, user, companyId: '', companyName: '', endedMessage: '' });
}

// Update the signed-in user, for example after a name change in My profile.
export function updateUser(changes: Partial<User>) {
  if (current.user) set({ ...current, user: { ...current.user, ...changes } });
}

export function selectCompany(companyId: string, companyName = '') {
  set({ ...current, companyId, companyName });
}

// Clear the session. With a message, the sign-in screen shows why (for example after a 401).
export function clearSession(endedMessage = '') {
  set({ token: '', user: null, companyId: '', companyName: '', endedMessage });
}

// Clear a session that the server refused. api() calls this on a 401.
export const endSession = () => clearSession(SESSION_ENDED);

// The owner has no company of their own. After they pick a company, the screens work as
// that company's admin (the server checks the X-Company-Id header).
export function uiRole(s: Session = current): Role | 'owner' | undefined {
  if (s.user?.role === 'owner') return s.companyId ? 'admin' : 'owner';
  return s.user?.role;
}
