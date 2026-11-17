import { TONE_TEXT } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { filterItems, type Counts, type StatusFilter } from './filters';

interface Props {
  value: StatusFilter;
  counts: Counts | undefined;
  onChange: (value: StatusFilter) => void;
}

// A small copy of the filters for the sticky bar. It shows when the big tiles scroll out of view.
// 4 equal columns (number above a small label). A label wraps to 2 lines on a narrow phone.
export function CompactFilters({ value, counts, onChange }: Props) {
  return (
    <div role="group" aria-label="Filter by status" className="mt-2 grid grid-cols-4 gap-1.5">
      {filterItems(counts).map((f) => {
        const on = f.key === value;
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(f.key)}
            className={cn(
              'flex min-h-12 flex-col items-center justify-center rounded-xl border bg-card px-1 leading-tight focus-visible:outline-2 focus-visible:outline-blue',
              on && 'border-blue bg-blue-tint ring-1 ring-blue',
            )}
          >
            <span className={cn('text-[15px] font-bold tabular-nums', f.tone ? TONE_TEXT[f.tone] : 'text-text')}>
              {f.count ?? '–'}
            </span>{' '}
            <span
              className={cn(
                'text-center text-[11px] text-balance',
                on ? 'font-semibold text-blue-text' : 'text-muted-foreground',
              )}
            >
              {f.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
