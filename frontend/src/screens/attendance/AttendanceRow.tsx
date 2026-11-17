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
  // The edit button (admin). It shows at the top right of the card.
  edit?: ReactNode;
  // The action button. It shows at the bottom right of the card.
  action?: ReactNode;
}

// One guard card: initials, name and guard ID at the top; the status and one action at the bottom.
export function GuardCard({ name, id, status, meta, adhoc, faded, edit, action }: Props) {
  return (
    <li className={cn('rounded-2xl border bg-card p-4', faded && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-soft text-[13px] font-bold text-blue-text"
        >
          {initials(name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col pt-0.5">
          <strong className="text-base leading-snug break-words text-text">
            {name}
            {adhoc && (
              <span className="ml-1.5 rounded-full bg-blue-tint px-2 py-0.5 align-middle text-[11px] font-semibold text-blue-text">
                ad hoc
              </span>
            )}
          </strong>
          <small className="text-[13px] text-muted-foreground">
            {id}
            {meta && ` · ${meta}`}
          </small>
        </span>
        {edit && <span className="-mt-2 -mr-2">{edit}</span>}
      </div>
      {(status || action) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {status ? (
            <span className={cn('flex items-center gap-2 text-sm font-semibold', status.tone)}>
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
              {status.text}
            </span>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
    </li>
  );
}

// The list of guard cards, with space between the cards.
export function GuardList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2.5">{children}</ul>;
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

// A card action. All actions have the same width. The label names the guard, so a screen reader
// can tell the cards apart.
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
      className="h-11 w-28 shrink-0 text-sm font-bold"
      aria-label={`${children} ${guard}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
