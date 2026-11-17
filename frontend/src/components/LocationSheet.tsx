import { Check } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { empCountLabel, locCity, plural, shortLoc } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Location } from '@/types/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[];
  // The selected location ID. '' is "All locations".
  current: string;
  // Add an "All locations" option at the top.
  withAll?: boolean;
  // The word for one person in the count, for example "guard".
  person?: string;
  onPick: (id: string) => void;
}

// Bottom sheet to choose a site (Reports and Home).
export function LocationSheet({ open, onOpenChange, locations, current, withAll, person = 'guard', onPick }: Props) {
  const options = [
    ...(withAll ? [{ id: '', title: 'All sites', meta: plural(locations.length, 'site') }] : []),
    ...locations.map((l) => ({
      id: l.id,
      title: shortLoc(l.name),
      meta: [locCity(l.name), l.area, empCountLabel(l, person), l.active ? '' : 'Disabled'].filter(Boolean).join(' · '),
    })),
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[80svh] w-full max-w-[430px] rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="px-5 pt-5 pb-0">
          <SheetTitle className="text-lg font-bold text-text">Choose site</SheetTitle>
          <SheetDescription className="sr-only">Pick the site to show.</SheetDescription>
        </SheetHeader>
        <div role="radiogroup" aria-label="Sites" className="overflow-y-auto px-5 pb-5">
          {options.map((o) => {
            const on = o.id === current;
            return (
              <button
                key={o.id || 'all'}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(o.id)}
                className={cn(
                  'mb-2 flex min-h-16 w-full items-center gap-3 rounded-[14px] border bg-card px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
                  on && 'border-blue bg-blue-tint',
                )}
              >
                <span className="flex flex-1 flex-col">
                  <strong className={cn('text-[15px]', on && 'text-blue-text')}>{o.title}</strong>
                  <small className="text-xs text-muted-foreground">{o.meta}</small>
                </span>
                {on && <Check className="size-[22px] text-blue-text" strokeWidth={2.4} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
