import type { Tone } from '@/lib/tone';
import type { AttendanceRecord, AttendanceStatus } from '@/types/api';

export type StatusFilter = AttendanceStatus | 'all';
export type Counts = { checked_in: number; completed: number; not_in: number };

// The 4 filters with their counts. The counts show only in the filters, one time on the screen.
export function filterItems(counts: Counts | undefined) {
  const total = counts ? counts.checked_in + counts.completed + counts.not_in : undefined;
  const items: { key: StatusFilter; label: string; count?: number; tone?: Tone }[] = [
    { key: 'all', label: 'All', count: total },
    { key: 'not_in', label: 'Not checked in', count: counts?.not_in, tone: 'amber' },
    { key: 'checked_in', label: 'Checked in', count: counts?.checked_in, tone: 'green' },
    { key: 'completed', label: 'Checked out', count: counts?.completed, tone: 'grey' },
  ];
  return items;
}

// The same rule as the server search (add_name_search): the text is in the name or the guard ID,
// with no case difference.
export const matchesSearch = (r: { name: string; employee_id: string }, find: string) =>
  !find ||
  r.name.toLowerCase().includes(find.toLowerCase()) ||
  r.employee_id.toLowerCase().includes(find.toLowerCase());

// Filter the site's rows on the phone. The app loads each site one time and does not ask the server
// again for a filter or a search.
export const filterRows = (rows: AttendanceRecord[], status: StatusFilter, find: string) =>
  rows.filter((r) => (status === 'all' || r.status === status) && matchesSearch(r, find));
