import { api } from '@/lib/api';
import { clearSession, getSession } from './session';

// Sign out on the server, then clear the session here.
export async function signOut() {
  try {
    if (getSession().token) await api('/api/logout', { method: 'POST', body: '{}' });
  } catch {
    // Clear the local session also when the server cannot be reached or the session already ended.
  }
  clearSession();
}
