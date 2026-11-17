import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, friendlyError, isApiError } from '@/lib/api';
import type { Location } from '@/types/api';

// The same query that Attendance, Guards and Reports use, so the list is often in the cache.
export const useSites = () => useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') });

// After a change to a site, load again each screen that shows sites.
export function useRefreshSites() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['locations', 'settings', 'dashboard', 'attendance', 'employees'])
      queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const errorText = (e: unknown) =>
  friendlyError(isApiError(e) ? e.status : 0, e instanceof Error ? e.message : 'Request failed');
