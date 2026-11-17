import type { Tone } from '@/lib/tone';
import type { AttendanceStatus } from '@/types/api';

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
