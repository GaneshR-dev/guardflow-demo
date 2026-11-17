import { Check } from 'lucide-react';
import { shortLoc } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Location } from '@/types/api';

interface Props {
  sites: Location[];
  value: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}

// Pick sites with checkboxes. Each row is 56 px high. Disabled sites show faded.
export function SiteChecklist({ sites, value, disabled, onChange }: Props) {
  if (!sites.length) return <p className="text-[13px] text-muted-foreground">No sites yet. Add a site first.</p>;
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="sr-only">Sites</legend>
      {sites.map((s) => {
        const on = value.includes(s.id);
        return (
          <label
            key={s.id}
            className={cn(
              'tap-card flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue',
              on && 'border-blue bg-blue-tint',
              !s.active && 'opacity-70',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={() => onChange(on ? value.filter((id) => id !== s.id) : [...value, s.id])}
            />
            <span
              aria-hidden="true"
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-md border-2',
                on ? 'border-blue bg-blue text-white' : 'border-line bg-card',
              )}
            >
              {on && <Check className="size-4" strokeWidth={3} />}
            </span>
            <span className="flex flex-col">
              <strong className="text-[15px]">{shortLoc(s.name)}</strong>
              <small className="text-xs text-muted-foreground">
                {s.area}
                {s.active ? '' : ' · Disabled'}
              </small>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
