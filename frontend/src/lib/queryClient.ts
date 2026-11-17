import { QueryClient } from '@tanstack/react-query';
import { subscribeSession, getSession } from '@/auth/session';
import { isApiError } from './api';

// Retry once after no network or a server error. Do not retry 4xx: the answer does not change.
export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => count < 1 && !(isApiError(error) && error.status >= 400 && error.status < 500),
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
  // A new session (sign-out, another sign-in, another company) must not show data of the old one.
  let last = `${getSession().token}|${getSession().companyId}`;
  subscribeSession(() => {
    const now = `${getSession().token}|${getSession().companyId}`;
    if (now !== last) client.clear();
    last = now;
  });
  return client;
}
