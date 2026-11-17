import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { empCountLabel, locCity, shiftLabel, shortLoc } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Location } from '@/types/api';

// One site card. A tap opens the site (both roles).
export function SiteRow({ site }: { site: Location }) {
  const off = !site.active;
  const place = [locCity(site.name), site.area].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        to={`/locations/${encodeURIComponent(site.id)}`}
        className={cn(
          'tap-card flex items-center gap-3 rounded-2xl border bg-card p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
          off && 'opacity-70',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <strong className="text-base leading-snug break-words text-text">
            {shortLoc(site.name)}
            {off && (
              <span className="ml-1.5 rounded-full bg-soft px-2 py-0.5 align-middle text-[11px] font-semibold text-muted-foreground">
                Disabled
              </span>
            )}
          </strong>
          {place && <small className="text-[13px] text-muted-foreground">{place}</small>}
          <small className="text-[13px] text-muted-foreground">
            {empCountLabel(site)} · {shiftLabel(site)}
          </small>
        </span>
        <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
