import { useMutation } from '@tanstack/react-query';
import { MapPin, MapPinPlus, Search, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { ScreenError } from '@/components/ScreenError';
import { StickySearchBar } from '@/components/StickySearchBar';
import { Button } from '@/components/ui/button';
import { Page } from '@/layout/AppShell';
import { api } from '@/lib/api';
import { csvRecords, readFileText } from '@/lib/csv';
import { plural } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useScrolledPast } from '@/lib/useScrolledPast';
import type { Location } from '@/types/api';
import { errorText, useRefreshSites, useSites } from './sites/data';
import { SiteRow } from './sites/SiteRow';
import { SiteSheet } from './sites/SiteSheet';

const matches = (l: Location, find: string) =>
  !find || `${l.name} ${l.area}`.toLowerCase().includes(find.toLowerCase());

// Sites: the list of sites, with a search. Admins add and import sites. A tap opens the site.
// `?add=1` opens the "Add a site" sheet at once (Home and Attendance link to it).
export function Sites() {
  const admin = uiRole(useSession()) === 'admin';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sites = useSites();
  const refresh = useRefreshSites();
  const [text, setText] = useState('');
  const [topRef, stuck] = useScrolledPast<HTMLDivElement>();
  const [fileError, setFileError] = useState<string | null>(null);
  const adding = admin && params.get('add') === '1';
  // After a save the screen opens the new site. The sheet then closes, but must not change the URL.
  const leaving = useRef(false);
  const setAdding = (on: boolean) => setParams(on ? { add: '1' } : {}, { replace: true });

  const importFile = useMutation({
    mutationFn: (rows: Record<string, string | number | null>[]) =>
      api<{ created: number; updated: number }>('/api/settings/locations/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      }),
    onSuccess: (r) => {
      toast(`Imported ${r.created} new and updated ${plural(r.updated, 'site')}`);
      refresh();
    },
  });
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input, so the same file can be picked again after a fix.
    e.target.value = '';
    if (!file || importFile.isPending) return;
    setFileError(null);
    importFile.reset();
    let records: Record<string, string>[] | null;
    try {
      records = csvRecords(await readFileText(file));
    } catch {
      setFileError('Could not read the file. Pick the CSV file again.');
      return;
    }
    if (!records) {
      setFileError('The file needs a header row and at least one site.');
      return;
    }
    importFile.mutate(
      records.map((r) => ({
        id: r.id || null,
        name: r.name,
        area: r.area,
        assigned_count: Number(r.assigned_count || 0),
      })),
    );
  };

  const find = text.trim();
  const all = sites.data || [];
  const shown = all.filter((l) => matches(l, find));
  const on = shown.filter((l) => l.active);
  const off = shown.filter((l) => !l.active);

  let body;
  if (sites.isPending) body = <LoadingRows label="Loading the sites…" rows={4} />;
  else if (!sites.data) body = <ScreenError error={sites.error} what="the sites" onRetry={() => sites.refetch()} />;
  else if (!all.length)
    body = admin ? (
      <EmptyState icon={<MapPin />} title="No sites yet" text="Add a site to start marking attendance.">
        <Button className="h-12 px-[22px]" onClick={() => setAdding(true)}>
          Add a site
        </Button>
      </EmptyState>
    ) : (
      <EmptyState
        icon={<MapPin />}
        title="No sites yet"
        text="You have no site. Ask an admin to give you access to a site."
      />
    );
  else
    body = (
      <>
        <div ref={topRef} />
        <StickySearchBar
          value={text}
          onChange={setText}
          label="Search sites by name or area"
          placeholder="Search site or area"
          stuck={stuck}
        />
        <section aria-label="Sites" className="mt-2">
          <p className="mb-2 text-[13px] text-muted-foreground" aria-live="polite">
            {find ? `${plural(shown.length, 'site')} found` : plural(on.length, 'site')}
          </p>
          {on.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {on.map((l) => (
                <SiteRow key={l.id} site={l} />
              ))}
            </ul>
          )}
          {!shown.length && (
            <EmptyState icon={<Search />} title={`No sites match "${find}"`} text="Check the site name or area.">
              <Button variant="outline" className="h-12 px-[22px]" onClick={() => setText('')}>
                Clear search
              </Button>
            </EmptyState>
          )}
          {off.length > 0 && (
            // Folded, as on Home and Guards. A search opens it, so a match is not hidden.
            <details key={find ? 'find' : 'list'} open={!!find || !on.length} className="mt-4">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue">
                {plural(off.length, 'disabled site')}
              </summary>
              <ul className="flex flex-col gap-2.5">
                {off.map((l) => (
                  <SiteRow key={l.id} site={l} />
                ))}
              </ul>
            </details>
          )}
        </section>
        {!admin && <p className="mt-4 text-[13px] text-muted-foreground">Only admins can change sites.</p>}
      </>
    );

  return (
    <Page
      title="Sites"
      back={{ to: '/settings', label: 'Settings' }}
      action={
        admin && sites.data ? (
          <span className="flex">
            <label
              className="tap-icon grid size-11 cursor-pointer place-items-center rounded-full text-blue has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue"
              title="Import sites from a CSV file"
            >
              <Upload className="size-[22px]" aria-hidden="true" />
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="Import sites from a CSV file"
                aria-busy={importFile.isPending || undefined}
                disabled={importFile.isPending}
                onChange={onFile}
                className="sr-only"
              />
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-blue"
              aria-label="Add a site"
              onClick={() => setAdding(true)}
            >
              <MapPinPlus className="size-[22px]" aria-hidden="true" />
            </Button>
          </span>
        ) : undefined
      }
    >
      {importFile.isPending && <p className="mb-2 text-sm text-muted-foreground">Importing the sites…</p>}
      {fileError && <ErrorBanner message={fileError} />}
      {importFile.error && <ErrorBanner message={`Could not import the file. ${errorText(importFile.error)}`} />}
      {sites.error && sites.data && <ErrorBanner message={`Could not refresh. ${errorText(sites.error)}`} />}
      {body}
      {admin && (
        <SiteSheet
          open={adding}
          onClose={() => !leaving.current && setAdding(false)}
          onSaved={(id) => {
            leaving.current = true;
            refresh();
            navigate(`/locations/${encodeURIComponent(id)}`, { replace: true });
          }}
        />
      )}
    </Page>
  );
}
