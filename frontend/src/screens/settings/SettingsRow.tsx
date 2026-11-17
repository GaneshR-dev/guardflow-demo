import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

interface Props {
  to: string;
  Icon: LucideIcon;
  title: string;
  // A short line under the title, or a count on the right.
  detail?: string;
  count?: string | number;
}

// One Settings entry: icon, title, a short line or a count, and a chevron. A real link, 64 px high.
export function SettingsRow({ to, Icon, title, detail, count }: Props) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-soft text-blue-text"
        >
          <Icon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <strong className="text-base">{title}</strong>
          {detail && <small className="truncate text-[13px] text-muted-foreground">{detail}</small>}
        </span>
        {count !== undefined && (
          <span className="text-sm font-semibold text-muted-foreground tabular-nums">{count}</span>
        )}
        <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
