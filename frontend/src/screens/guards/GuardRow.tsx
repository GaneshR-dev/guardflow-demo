import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/api';

interface Props {
  guard: Employee;
  // The short site name, or "No site yet".
  site: string;
  // False when the guard or the site is disabled.
  on: boolean;
  // False when the site of the guard is disabled: the site must be enabled first.
  siteOn: boolean;
  admin: boolean;
  onOpen: () => void;
  onEnable: () => void;
  enabling: boolean;
}

// One guard card. An admin taps an active card to edit the guard. A disabled card has an
// "Enable" button (admin), or a note when the site is disabled.
export function GuardRow({ guard, site, on, siteOn, admin, onOpen, onEnable, enabling }: Props) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-soft text-[13px] font-bold text-blue-text"
      >
        {initials(guard.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="text-base leading-snug break-words text-text">
          {guard.name}
          {!on && (
            <span className="ml-1.5 rounded-full bg-soft px-2 py-0.5 align-middle text-[11px] font-semibold text-muted-foreground">
              Disabled
            </span>
          )}
        </strong>
        <small className="text-[13px] text-muted-foreground">
          {guard.id} · {site}
        </small>
        {!on && admin && !siteOn && <small className="text-[13px] text-muted-foreground">Enable the site first.</small>}
      </span>
    </>
  );
  const box = 'flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left';
  if (on && admin)
    return (
      <li>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Edit ${guard.name}, ${guard.id}, ${site}`}
          className={cn(
            box,
            'tap-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
          )}
        >
          {body}
          <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </li>
    );
  return (
    <li className={cn(box, !on && 'opacity-70')}>
      {body}
      {!on && admin && siteOn && !guard.active && (
        <Button
          variant="outline"
          className="h-11 w-24 shrink-0"
          aria-label={`Enable ${guard.name}`}
          disabled={enabling}
          onClick={onEnable}
        >
          {enabling ? 'Enabling…' : 'Enable'}
        </Button>
      )}
    </li>
  );
}
