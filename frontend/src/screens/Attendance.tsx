import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, MapPin, Search, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { LocationSheet } from '@/components/LocationSheet';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Page } from '@/layout/AppShell';
import { api, ApiError, friendlyError, isApiError } from '@/lib/api';
import { fmtShortDay, fmtTime, shortLoc, todayISO } from '@/lib/format';
import { oneRowEach, openRecord } from '@/lib/hours';
import { cn } from '@/lib/utils';
import type { AttendanceAnswer, AttendanceRecord, Location, LookupMatch } from '@/types/api';
import { AddGuardSheet } from './attendance/AddGuardSheet';
import { EditButton, GuardCard, GuardList, RowButton } from './attendance/AttendanceRow';
import { CompactFilters } from './attendance/CompactFilters';
import { EditTimesSheet } from './attendance/EditTimesSheet';
import { statusOf } from './attendance/status';
import type { StatusFilter } from './attendance/filters';
import { StatusTiles } from './attendance/StatusTiles';
import { useAttendanceActions } from './attendance/useAttendanceActions';

const FILTERS: StatusFilter[] = ['all', 'not_in', 'checked_in', 'completed'];

const EMPTY: Record<StatusFilter, string> = {
  all: 'No guards at this site yet.',
  not_in: 'All guards are checked in.',
  checked_in: 'No guards are checked in.',
  completed: 'No guards checked out yet.',
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Search for guards at other sites. A 404 means "no match", not an error.
async function lookup(q: string): Promise<LookupMatch[]> {
  try {
    const r = await api<LookupMatch | { matches: LookupMatch[] }>(
      '/api/employee-lookup?employee_id=' + encodeURIComponent(q),
    );
    return 'matches' in r ? r.matches : [r];
  } catch (err) {
    if (isApiError(err) && err.status === 404) return [];
    throw err;
  }
}

export function Attendance() {
  const session = useSession();
  const admin = uiRole(session) === 'admin';
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = (FILTERS as string[]).includes(params.get('status') || '')
    ? (params.get('status') as StatusFilter)
    : 'all';
  const [text, setText] = useState(params.get('q') || '');
  const q = useDebounced(text.trim(), 300);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [blocked, setBlocked] = useState<unknown>(null);

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  // Keep the search in the URL, so a reload keeps it.
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  useEffect(() => {
    // Do nothing when the URL already has this search, so the update cannot repeat.
    if ((paramsRef.current.get('q') || '') === q) return;
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [q, setParams]);

  const sites = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') });
  const active = (sites.data || []).filter((l) => l.active);
  const wanted = params.get('location');
  const site = wanted ? active.find((l) => l.id === wanted) || null : active[0] || null;

  const list = useQuery({
    queryKey: ['attendance', site?.id, status, q],
    enabled: !!site,
    queryFn: () => {
      const p = new URLSearchParams({ location_id: site!.id, day: todayISO() });
      if (q) p.set('q', q);
      if (status !== 'all') p.set('status', status);
      return api<AttendanceAnswer>('/api/attendance?' + p);
    },
  });
  const others = useQuery({ queryKey: ['lookup', q], enabled: !!site && q.length >= 2, queryFn: () => lookup(q) });

  const { askCheckin, askCheckout, dialog } = useAttendanceActions(site, setBlocked);
  const setStatus = (v: StatusFilter) => setParam('status', v === 'all' ? '' : v);

  // Show the compact filters in the sticky bar when the big tiles are above the screen.
  const tilesRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const tilesShown = !!site && !blocked;
  useEffect(() => {
    const el = tilesRef.current;
    // Old browsers and the test runner have no IntersectionObserver. Then the tiles are enough.
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [tilesShown]);
  const changeSite = (id: string) => {
    setBlocked(null);
    setSheetOpen(false);
    setParam('location', id);
  };

  const siteControl =
    site && active.length > 1 ? (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Change site, now ${shortLoc(site.name)}`}
        onClick={() => setSheetOpen(true)}
        className="flex h-11 max-w-[60%] items-center gap-2 rounded-xl border bg-card px-3 text-[15px] font-semibold text-text focus-visible:outline-2 focus-visible:outline-blue"
      >
        <MapPin className="size-[18px] shrink-0 text-blue" aria-hidden="true" />
        <span className="truncate">{shortLoc(site.name)}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    ) : site ? (
      <span className="flex h-11 items-center gap-2 text-[15px] font-semibold">
        <MapPin className="size-[18px] text-blue" aria-hidden="true" />
        {shortLoc(site.name)}
      </span>
    ) : null;

  let body;
  if (sites.isPending) body = <LoadingRows label="Loading your sites…" rows={4} />;
  else if (sites.error && !sites.data)
    body = <ScreenError error={sites.error} what="your sites" onRetry={() => sites.refetch()} />;
  else if (!active.length)
    body = admin ? (
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
  else if (!site)
    body = (
      <ScreenError error={new ApiError('Site not found', 404)} atLocation onChooseLocation={() => setSheetOpen(true)} />
    );
  else if (blocked)
    body = (
      <ScreenError
        error={blocked}
        atLocation
        onChooseLocation={() => setSheetOpen(true)}
        onRetry={() => {
          setBlocked(null);
          list.refetch();
        }}
      />
    );
  else {
    const data = list.data;
    const rows = data ? oneRowEach(data.rows) : [];
    const stale = (data?.stale_open || []).filter(
      (r) =>
        (status === 'all' || status === 'checked_in') &&
        (!q || (r.name + ' ' + r.employee_id).toLowerCase().includes(q.toLowerCase())),
    );
    const matches = (others.data || []).filter(
      (m) => m.location_id !== site.id && !rows.some((r) => r.employee_id === m.id),
    );
    const editFor = (r: AttendanceRecord) =>
      admin && r.status !== 'not_in' ? <EditButton name={r.name} onClick={() => setEditing(r)} /> : undefined;
    const actionFor = (r: AttendanceRecord) =>
      r.status === 'checked_in' ? (
        <RowButton
          outline
          guard={r.name}
          onClick={() => {
            const open = openRecord(r.employee_id, data!.rows, data!.stale_open);
            askCheckout({ id: r.employee_id, name: r.name }, open?.check_in ?? r.check_in);
          }}
        >
          Check out
        </RowButton>
      ) : (
        // Not checked in, or checked out: a checked-out guard can start one more shift. The same filled
        // button as the other check-ins (the server asks to confirm a second shift).
        <RowButton guard={r.name} onClick={() => askCheckin({ id: r.employee_id, name: r.name }, !!r.adhoc)}>
          Check in
        </RowButton>
      );
    body = (
      <>
        <StatusTiles ref={tilesRef} value={status} counts={data?.summary} disabled={!data} onChange={setStatus} />

        {/* The search stays at the top while the list scrolls. When the big tiles scroll out of view,
            a one-line copy of the filters shows here too. */}
        <div
          className={cn(
            'sticky top-0 z-10 -mx-[22px] mt-3 bg-app px-[22px] py-2 max-[379px]:-mx-4 max-[379px]:px-4',
            compact && 'border-b shadow-[0_6px_12px_-10px_rgba(20,45,90,0.35)]',
          )}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search guards by name or guard ID"
              placeholder="Search name or guard ID"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-12 rounded-xl border-line bg-field pl-10 text-base"
            />
          </div>
          {compact && data && <CompactFilters value={status} counts={data.summary} onChange={setStatus} />}
        </div>

        {list.error && data && (
          <ErrorBanner
            message={`Could not refresh. ${friendlyError(isApiError(list.error) ? list.error.status : 0, list.error.message)}`}
          />
        )}

        {list.isPending ? (
          <div className="mt-2">
            <LoadingRows label={`Loading attendance at ${shortLoc(site.name)}…`} rows={6} />
          </div>
        ) : !data ? (
          <ScreenError
            error={list.error}
            atLocation
            what="the attendance"
            onRetry={() => list.refetch()}
            onChooseLocation={() => setSheetOpen(true)}
          />
        ) : (
          <>
            {stale.length > 0 && (
              <section aria-label="Open from earlier days" className="mt-3">
                <h2 className="mb-1 text-base font-bold">Open from earlier days</h2>
                <p className="mb-2.5 text-[13px] text-muted-foreground">
                  These check-ins were not closed. Check out each guard. An admin can then correct the times.
                </p>
                <GuardList>
                  {stale.map((r) => (
                    <GuardCard
                      key={r.employee_id + r.day}
                      name={r.name}
                      id={r.employee_id}
                      status={{ text: `Since ${fmtShortDay(r.day)}, ${fmtTime(r.check_in)}`, tone: 'text-amber-text' }}
                      action={
                        <RowButton
                          outline
                          guard={r.name}
                          onClick={() =>
                            askCheckout({ id: r.employee_id, name: r.name }, r.check_in, fmtShortDay(r.day))
                          }
                        >
                          Check out
                        </RowButton>
                      }
                    />
                  ))}
                </GuardList>
              </section>
            )}

            <section aria-label="Guards at this site" className="mt-3">
              {stale.length > 0 && rows.length > 0 && <h2 className="mb-2.5 text-base font-bold">Today</h2>}
              {rows.length ? (
                <GuardList>
                  {rows.map((r) => (
                    <GuardCard
                      key={r.employee_id}
                      name={r.name}
                      id={r.employee_id}
                      adhoc={r.adhoc}
                      status={statusOf(r)}
                      edit={editFor(r)}
                      action={actionFor(r)}
                    />
                  ))}
                </GuardList>
              ) : q ? (
                <EmptyState icon={<Search />} title={`No guards match "${q}"`} text="Check the name or guard ID.">
                  {/* Simple text and a link, not a box (the collaborator's choice). */}
                  <p className="text-[13px] text-muted-foreground">
                    Can't find a guard?{' '}
                    {admin ? `Add a new guard to ${shortLoc(site.name)}.` : 'Ask an admin to add the guard.'}
                  </p>
                  {admin && (
                    <Button variant="link" className="h-11 gap-1.5 px-0 text-blue" onClick={() => setAddOpen(true)}>
                      <UserPlus className="size-[18px]" aria-hidden="true" />
                      Add a guard
                    </Button>
                  )}
                </EmptyState>
              ) : (
                <EmptyState
                  icon={<Search />}
                  title={EMPTY[status]}
                  text={
                    status === 'all' ? 'Guards that join this site show here.' : 'Show all guards to see the full list.'
                  }
                >
                  {status !== 'all' && (
                    <Button variant="outline" className="h-12 px-[22px]" onClick={() => setStatus('all')}>
                      Show all
                    </Button>
                  )}
                </EmptyState>
              )}
            </section>

            {/* Show this section only when another site has a match, or the search failed. */}
            {q.length >= 2 && (matches.length > 0 || others.isError) ? (
              <section aria-label={`Other guards matching "${q}"`} className="mt-5">
                <h2 className="mb-2.5 text-base font-bold">Other guards matching “{q}”</h2>
                {others.isError ? (
                  <ErrorBanner message="Could not search the other sites. Try again in a moment." />
                ) : (
                  <GuardList>
                    {matches.map((m) => (
                      <GuardCard
                        key={m.id}
                        name={m.name}
                        id={m.id}
                        meta={m.location_name ? shortLoc(m.location_name) : 'No site'}
                        faded={!m.active}
                        adhoc={!!m.active}
                        status={
                          m.active
                            ? undefined
                            : { text: 'Disabled. An admin can enable this guard.', tone: 'text-muted-foreground' }
                        }
                        action={
                          m.active ? (
                            <RowButton guard={m.name} onClick={() => askCheckin({ id: m.id, name: m.name }, true)}>
                              Check in
                            </RowButton>
                          ) : undefined
                        }
                      />
                    ))}
                  </GuardList>
                )}
              </section>
            ) : null}
          </>
        )}
      </>
    );
  }

  const addButton =
    admin && site ? (
      <Button
        variant="ghost"
        size="icon"
        className="size-11 text-blue"
        aria-label="Add a guard"
        onClick={() => setAddOpen(true)}
      >
        <UserPlus className="size-[22px]" aria-hidden="true" />
      </Button>
    ) : undefined;

  return (
    <Page title="Mark attendance" action={addButton}>
      <div className="-mt-2 mb-4 flex items-center justify-between gap-3">
        {siteControl}
        <span className="text-sm text-muted-foreground">
          {list.data ? fmtShortDay(list.data.day) : ''} · Times in IST
        </span>
      </div>
      {body}
      {dialog}
      <LocationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        locations={active}
        current={site?.id || ''}
        onPick={changeSite}
      />
      {site && admin && (
        <>
          <EditTimesSheet
            record={editing}
            site={site}
            day={list.data?.day || ''}
            onClose={() => setEditing(null)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['attendance'] })}
          />
          <AddGuardSheet
            open={addOpen}
            site={{ id: site.id, name: shortLoc(site.name) }}
            onClose={() => setAddOpen(false)}
            onAdded={() => {
              queryClient.invalidateQueries({ queryKey: ['attendance'] });
              queryClient.invalidateQueries({ queryKey: ['locations'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            }}
          />
        </>
      )}
    </Page>
  );
}
