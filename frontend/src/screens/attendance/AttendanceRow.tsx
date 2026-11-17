import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  name: string;
  id: string;
  // The status text and its colour class, for example "Checked in 9:04 am" in green.
  status?: { text: string; tone: string };
  // Extra text after the ID, for example the home site of an ad hoc guard.
  meta?: string;
  adhoc?: boolean;
  faded?: boolean;
  action?: ReactNode;
}

// One guard row: initials, name, guard ID and status, and one action on the right.
export function GuardRow({ name, id, status, meta, adhoc, faded, action }: Props) {
  return (
    <li
      className={cn('flex min-h-16 items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0', faded && 'opacity-70')}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-soft text-[13px] font-bold text-blue-text"
      >
        {initials(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="text-[15px] leading-snug break-words text-text">
          {name}
          {adhoc && (
            <span className="ml-1.5 rounded-full bg-blue-tint px-2 py-0.5 align-middle text-[11px] font-semibold text-blue-text">
              ad hoc
            </span>
          )}
        </strong>
        {/* The status keeps one line. When the space is too small, it moves under the ID. */}
        <small className="flex flex-wrap gap-x-1.5 text-[13px] leading-snug text-muted-foreground">
          <span>
            {id}
            {meta && ` · ${meta}`}
          </span>
          {status && <span className={cn('font-semibold whitespace-nowrap', status.tone)}>{status.text}</span>}
        </small>
      </span>
      {action}
    </li>
  );
}

export function EditButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 text-blue"
      aria-label={`Edit times for ${name}`}
      onClick={onClick}
    >
      <Pencil className="size-[18px]" aria-hidden="true" />
    </Button>
  );
}

// A row action. The label names the guard, so a screen reader can tell the rows apart.
export function RowButton({
  children,
  guard,
  onClick,
  outline,
}: {
  children: string;
  guard: string;
  onClick: () => void;
  outline?: boolean;
}) {
  return (
    <Button
      variant={outline ? 'outline' : 'default'}
      className="h-11 shrink-0 px-4 text-sm font-bold"
      aria-label={`${children} ${guard}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
