import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MapPin, RotateCw } from 'lucide-react';
import { Link } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { ProgressBar } from '@/components/ProgressBar';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Page } from '@/layout/AppShell';
import { api, friendlyError, isApiError } from '@/lib/api';
import { groupCoverage, percent, type Coverage } from '@/lib/coverage';
import { fmtShift, fmtShortDay, fmtTime, plural, shortLoc, toHHMM } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Dashboard } from '@/types/api';

const attendanceLink = (id: string) => `/attendance?location=${encodeURIComponent(id)}`;

function statusText(c: Coverage) {
  if (c.group === 'attention') return `${c.notIn} not checked in`;
  if (c.group === 'upcoming') return c.nextStart ? `Shift starts ${fmtShift(c.nextStart)}` : 'Shift not started';
  if (c.group === 'disabled') return 'Disabled';
  return c.total ? 'All checked in' : 'No guards';
}

// One card for each location. A tap opens Attendance for that location, where the user can act.
function LocationCard({ c }: { c: Coverage }) {
  const name = shortLoc(c.location.name);
  const status = statusText(c);
  return (
    <Link
      to={attendanceLink(c.location.id)}
      aria-label={`${name}, ${c.came} of ${c.total} came today, ${status}`}
      className={cn(
        'mb-2.5 flex min-h-11 flex-col gap-2.5 rounded-2xl border bg-card px-4 py-3.5 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
        c.group === 'disabled' && 'opacity-70',
      )}
    >
      <span className="flex items-center gap-2">
        <strong className="flex-1 truncate text-[15px]">{name}</strong>
        <span className="text-sm font-semibold tabular-nums">
          {c.came} of {c.total}
        </span>
        <ChevronRight className="size-[18px] text-muted-foreground" aria-hidden="true" />
      </span>
      <ProgressBar value={percent(c.came, c.total)} />
      <span
        className={cn(
          'text-[13px]',
          c.group === 'attention' && 'font-semibold text-amber-text',
          c.group === 'ok' && c.total > 0 && 'text-green-text',
          (c.group === 'upcoming' || c.group === 'disabled' || !c.total) && 'text-muted-foreground',
        )}
      >
        {status}
      </span>
    </Link>
  );
}

// One big number with its label. Each number shows one time only on the screen.
// Status colours (docs/GLOSSARY.md): green = Checked in, grey = Checked out, amber = Not checked in.
function Tile({ value, label, tone }: { value: number; label: string; tone?: 'green' | 'grey' | 'amber' }) {
  return (
    <div className="rounded-xl border bg-card px-3.5 py-3">
      <strong
        className={cn(
          'block text-[26px] leading-tight font-bold tabular-nums',
          tone === 'green' && 'text-green-text',
          tone === 'grey' && 'text-muted-foreground',
          tone === 'amber' && 'text-amber-text',
        )}
      >
        {value}
      </strong>
      <span className="mt-0.5 block text-[13px] text-muted-foreground">{label}</span>
    </div>
  );
}

function Section({ title, items }: { title: string; items: Coverage[] }) {
  if (!items.length) return null;
  return (
    <section aria-label={title}>
      <h2 className="mt-6 mb-3 text-base font-bold">{title}</h2>
      {items.map((c) => (
        <LocationCard key={c.location.id} c={c} />
      ))}
    </section>
  );
}

export function Home() {
  const session = useSession();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/api/dashboard') });
  const { data, isPending, isFetching, error, dataUpdatedAt, refetch } = dashboard;

  const refresh = (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 text-blue"
      aria-label="Refresh"
      disabled={isFetching}
      onClick={() => refetch()}
    >
      <RotateCw className={cn('size-5', isFetching && 'animate-spin')} aria-hidden="true" />
    </Button>
  );

  let body;
  if (isPending) body = <LoadingRows label="Loading today's attendance…" rows={3} />;
  else if (!data) body = <ScreenError error={error} what="the overview" onRetry={() => refetch()} />;
  else if (!data.locations.length)
    body =
      uiRole(session) === 'admin' ? (
        <EmptyState icon={<MapPin />} title="No sites yet" text="Add a site to start marking attendance.">
          <Button asChild className="h-12 px-[22px]">
            <Link to="/locations">Add a site</Link>
          </Button>
        </EmptyState>
      ) : (
        <EmptyState
          icon={<MapPin />}
          title="No sites yet"
          text="You have no site. Ask an admin to give you access to a site."
        />
      );
  else {
    // Group by the load time, so the groups match the "Updated" time on the screen.
    const groups = groupCoverage(data.locations, toHHMM(new Date(dataUpdatedAt).toISOString()));
    const only = data.locations.length === 1 ? data.locations[0] : null;
    body = (
      <>
        {/* A failed refresh keeps the last data on the screen. */}
        {error && (
          <ErrorBanner
            message={`Could not refresh. ${friendlyError(isApiError(error) ? error.status : 0, error.message)}`}
          />
        )}
        <section aria-label="Today's summary" className="grid grid-cols-2 gap-2.5">
          <Tile value={data.employees} label="Guards" />
          <Tile value={data.checked_in} label="Checked in" tone="green" />
          <Tile value={data.completed} label="Checked out" tone="grey" />
          <Tile
            value={data.not_checked_in}
            label="Not checked in"
            tone={data.not_checked_in > 0 ? 'amber' : undefined}
          />
        </section>
        {only?.active ? (
          <Button asChild className="mt-5 h-[54px] w-full rounded-xl text-[15px] font-extrabold">
            <Link to={attendanceLink(only.id)}>Mark attendance</Link>
          </Button>
        ) : (
          <>
            <Section title="Needs attention" items={groups.attention} />
            <Section title="Upcoming" items={groups.upcoming} />
            <Section title="All checked in" items={groups.ok} />
            {groups.disabled.length > 0 && (
              <details className="mt-4">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue">
                  {plural(groups.disabled.length, 'disabled site')}
                </summary>
                {groups.disabled.map((c) => (
                  <LocationCard key={c.location.id} c={c} />
                ))}
              </details>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <Page title="Attendance overview">
      <div className="-mt-2 mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status">
          {data
            ? `Today · ${fmtShortDay(data.day)} · Updated ${fmtTime(new Date(dataUpdatedAt).toISOString())}`
            : 'Today'}
        </p>
        {data && refresh}
      </div>
      {body}
    </Page>
  );
}
