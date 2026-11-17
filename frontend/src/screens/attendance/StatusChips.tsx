import { cn } from '@/lib/utils';
import type { AttendanceStatus } from '@/types/api';

export type StatusFilter = AttendanceStatus | 'all';

interface Props {
  value: StatusFilter;
  counts: { checked_in: number; completed: number; not_in: number } | undefined;
  disabled?: boolean;
  onChange: (value: StatusFilter) => void;
}

// Filter buttons with the counts, in a 2 × 2 grid so all four show at 390 px. The counts show here only, one time on the screen.
// Colours from docs/GLOSSARY.md: green = Checked in, grey = Checked out, amber = Not checked in.
export function StatusChips({ value, counts, disabled, onChange }: Props) {
  const total = counts ? counts.checked_in + counts.completed + counts.not_in : undefined;
  const chips: { key: StatusFilter; label: string; count?: number; tone: string }[] = [
    { key: 'all', label: 'All', count: total, tone: 'text-text' },
    { key: 'not_in', label: 'Not checked in', count: counts?.not_in, tone: 'text-amber-text' },
    { key: 'checked_in', label: 'Checked in', count: counts?.checked_in, tone: 'text-green-text' },
    { key: 'completed', label: 'Checked out', count: counts?.completed, tone: 'text-muted-foreground' },
  ];
  return (
    <div role="group" aria-label="Filter by status" className="grid grid-cols-2 gap-2">
      {chips.map((c) => {
        const on = c.key === value;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(c.key)}
            className={cn(
              'flex h-11 items-center justify-between gap-1.5 rounded-xl border bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-60',
              on && 'border-blue bg-blue-tint text-blue-text',
            )}
          >
            {c.label}
            {c.count !== undefined && (
              <span className={cn('tabular-nums', on ? 'text-blue-text' : c.tone)}>{c.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
