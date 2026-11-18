import { forwardRef } from 'react';
import { StatTile } from '@/components/StatTile';
import { filterItems, type Counts, type StatusFilter } from './filters';

interface Props {
  value: StatusFilter;
  counts: Counts | undefined;
  disabled?: boolean;
  onChange: (value: StatusFilter) => void;
}

// The filters as big tiles, the same style as the Home tiles.
export const StatusTiles = forwardRef<HTMLDivElement, Props>(function StatusTiles(
  { value, counts, disabled, onChange },
  ref,
) {
  return (
    <div ref={ref} role="group" aria-label="Filter by status" className="grid grid-cols-2 gap-2.5">
      {filterItems(counts).map((f) => (
        <StatTile
          key={f.key}
          value={f.count ?? '–'}
          label={f.label}
          tone={f.tone}
          pressed={f.key === value}
          disabled={disabled}
          onClick={() => onChange(f.key)}
        />
      ))}
    </div>
  );
});
