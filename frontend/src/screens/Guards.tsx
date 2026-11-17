import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, MapPin, Search, Upload, UserPlus, Users } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { GuardSheet } from '@/components/GuardSheet';
import { LoadingRows } from '@/components/LoadingRows';
import { LocationSheet } from '@/components/LocationSheet';
import { ScreenError } from '@/components/ScreenError';
import { StickySearchBar } from '@/components/StickySearchBar';
import { Button } from '@/components/ui/button';
import { Page } from '@/layout/AppShell';
import { api, friendlyError, isApiError } from '@/lib/api';
import { csvRecords, readFileText } from '@/lib/csv';
import { plural, shortLoc } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useScrolledPast } from '@/lib/useScrolledPast';
import type { Employee, EmployeeImportAnswer, Location } from '@/types/api';
import { matchesSearch } from './attendance/filters';
import { GuardRow } from './guards/GuardRow';
import { useEmployees } from './settings/data';

const errorText = (e: unknown) =>
  friendlyError(isApiError(e) ? e.status : 0, e instanceof Error ? e.message : 'Request failed');

// Guards: the list of all guards, with a site filter and a search. Admins add, edit, disable,
// enable and import guards. The list loads one time (Settings already loads it); the filter and
// the search work on the phone.
export function Guards() {
  const admin = uiRole(useSession()) === 'admin';
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const guards = useEmployees();
  const sites = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') });
  const [text, setText] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [disabling, setDisabling] = useState<Employee | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [siteRef, stuck] = useScrolledPast<HTMLDivElement>();

  const siteList = sites.data || [];
  const byId = new Map(siteList.map((l) => [l.id, l]));
  // The site filter is in the URL. A site that is not in the list (or "none" for a supervisor)
  // shows all sites.
  const raw = params.get('site') || '';
  const site = raw === 'none' ? (admin ? 'none' : '') : byId.has(raw) ? raw : '';
  const siteName = (id: string | null) => (id ? shortLoc(byId.get(id)?.name) || id : 'No site yet');
  const siteOn = (g: Employee) => !g.location_id || byId.get(g.location_id)?.active !== 0;
  const isOn = (g: Employee) => !!g.active && siteOn(g);

  const refresh = () => {
    for (const key of ['employees', 'locations', 'dashboard', 'attendance', 'settings'])
      queryClient.invalidateQueries({ queryKey: [key] });
  };
  const changeSite = (id: string) => {
    setSheetOpen(false);
    setText('');
    setParams(id ? { site: id } : {}, { replace: true });
  };

  const enable = useMutation({
    mutationFn: (g: Employee) => api(`/api/employees/${encodeURIComponent(g.id)}/enable`, { method: 'POST' }),
    onSuccess: (_r, g) => {
      toast(`Guard enabled · ${g.name}`);
      refresh();
    },
  });
  const disable = useMutation({
    mutationFn: (g: Employee) => api(`/api/employees/${encodeURIComponent(g.id)}`, { method: 'DELETE' }),
    onSuccess: (_r, g) => {
      toast(`Guard disabled · ${g.name}`);
      setDisabling(null);
      refresh();
    },
  });
  const importFile = useMutation({
    mutationFn: (rows: Record<string, string | null>[]) =>
      api<EmployeeImportAnswer>('/api/employees/import', { method: 'POST', body: JSON.stringify({ rows }) }),
    onSuccess: (r) => {
      toast(`Imported ${r.created} new and updated ${plural(r.updated, 'guard')}`);
      setImportWarnings(r.warnings || []);
      refresh();
    },
  });
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input, so the same file can be picked again after a fix.
    e.target.value = '';
    if (!file || importFile.isPending) return;
    setFileError(null);
    setImportWarnings([]);
    importFile.reset();
    let records: Record<string, string>[] | null;
    try {
      records = csvRecords(await readFileText(file));
    } catch {
      setFileError('Could not read the file. Pick the CSV file again.');
      return;
    }
    if (!records) {
      setFileError('The file needs a header row and at least one guard.');
      return;
    }
    const fallback = site && site !== 'none' ? site : null;
    importFile.mutate(
      records.map((r) => ({
        id: r.id || null,
        name: r.name,
        phone: r.phone,
        role: r.role || 'Guard',
        location_id: r.location_id || fallback,
      })),
    );
  };

  const find = text.trim();
  const all = guards.data || [];
  const inSite = all.filter((g) => !site || (site === 'none' ? !g.location_id : g.location_id === site));
  const shown = inSite.filter((g) => matchesSearch({ name: g.name, employee_id: g.id }, find));
  const active = shown.filter(isOn);
  const disabled = shown.filter((g) => !isOn(g));
  const row = (g: Employee) => (
    <GuardRow
      key={g.id}
      guard={g}
      site={siteName(g.location_id)}
      on={isOn(g)}
      siteOn={siteOn(g)}
      admin={admin}
      onOpen={() => setEditing(g)}
      onEnable={() => enable.mutate(g)}
      enabling={enable.isPending && enable.variables?.id === g.id}
    />
  );

  const siteLabel = site === 'none' ? 'No site yet' : site ? siteName(site) : 'All sites';
  let body;
  if (guards.isPending || sites.isPending) body = <LoadingRows label="Loading the guards…" rows={6} />;
  else if (!guards.data || !sites.data)
    body = (
      <ScreenError
        error={guards.error || sites.error}
        what="the guards"
        onRetry={() => {
          if (guards.error) guards.refetch();
          if (sites.error) sites.refetch();
        }}
      />
    );
  else if (!all.length)
    body = (
      <EmptyState
        icon={<Users />}
        title="No guards yet"
        text={admin ? 'Add a guard, or import a CSV file.' : 'The guards at your sites show here.'}
      >
        {admin && (
          <Button className="h-12 px-[22px]" onClick={() => setAdding(true)}>
            Add a guard
          </Button>
        )}
      </EmptyState>
    );
  else
    body = (
      <>
        <div ref={siteRef}>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Change site, now ${siteLabel}`}
            onClick={() => setSheetOpen(true)}
            className="tap-card flex h-11 w-full items-center gap-2 rounded-xl border bg-card px-3 text-[15px] font-semibold text-text focus-visible:outline-2 focus-visible:outline-blue"
          >
            <MapPin className="size-[18px] shrink-0 text-blue" aria-hidden="true" />
            <span className="truncate">{siteLabel}</span>
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
        <StickySearchBar
          value={text}
          onChange={setText}
          label="Search guards by name or guard ID"
          placeholder="Search name or guard ID"
          stuck={stuck}
        />
        {importWarnings.length > 0 && (
          <div
            role="status"
            className="mt-2 rounded-xl border border-amber/40 bg-amber-soft p-3 text-sm text-amber-text"
          >
            <strong className="block font-semibold">Imported. Check these possible duplicates:</strong>
            <ul className="mt-1 list-disc pl-5">
              {importWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <section aria-label="Guards" className="mt-2">
          <p className="mb-2 text-[13px] text-muted-foreground" aria-live="polite">
            {find ? `${plural(shown.length, 'guard')} found` : plural(active.length, 'guard')}
          </p>
          {active.length > 0 && <ul className="flex flex-col gap-2.5">{active.map(row)}</ul>}
          {!shown.length &&
            (find ? (
              <EmptyState icon={<Search />} title={`No guards match "${find}"`} text="Check the name or guard ID.">
                <Button variant="outline" className="h-12 px-[22px]" onClick={() => setText('')}>
                  Clear search
                </Button>
              </EmptyState>
            ) : (
              <EmptyState
                icon={<Users />}
                title={site === 'none' ? 'All guards have a site' : 'No guards at this site'}
                text={admin ? 'Add a guard, or show all sites.' : 'Show all sites to see the full list.'}
              >
                <Button variant="outline" className="h-12 px-[22px]" onClick={() => changeSite('')}>
                  Show all sites
                </Button>
              </EmptyState>
            ))}
          {disabled.length > 0 && (
            // Folded, as the disabled sites on Home. A search opens it, so a match is not hidden.
            <details key={find ? 'find' : 'list'} open={!!find || !active.length} className="mt-4">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue">
                {plural(disabled.length, 'disabled guard')}
              </summary>
              <ul className="flex flex-col gap-2.5">{disabled.map(row)}</ul>
            </details>
          )}
        </section>
        {!admin && <p className="mt-4 text-[13px] text-muted-foreground">Only admins can change guards.</p>}
      </>
    );

  const actionError = enable.error || importFile.error;
  return (
    <Page
      title="Guards"
      back={{ to: '/settings', label: 'Settings' }}
      action={
        admin && guards.data ? (
          <span className="flex">
            <label
              className="tap-icon grid size-11 cursor-pointer place-items-center rounded-full text-blue has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue"
              title="Import guards from a CSV file"
            >
              <Upload className="size-[22px]" aria-hidden="true" />
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="Import guards from a CSV file"
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
              aria-label="Add a guard"
              onClick={() => setAdding(true)}
            >
              <UserPlus className="size-[22px]" aria-hidden="true" />
            </Button>
          </span>
        ) : undefined
      }
    >
      {importFile.isPending && <p className="mb-2 text-sm text-muted-foreground">Importing the guards…</p>}
      {fileError && <ErrorBanner message={fileError} />}
      {actionError && (
        <ErrorBanner
          message={`${enable.error ? 'Could not enable the guard.' : 'Could not import the file.'} ${errorText(actionError)}`}
        />
      )}
      {guards.error && guards.data && <ErrorBanner message={`Could not refresh. ${errorText(guards.error)}`} />}
      {body}
      <LocationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        locations={siteList}
        current={site}
        withAll
        withNone={admin}
        onPick={changeSite}
      />
      {admin && (
        <>
          <GuardSheet
            open={adding || !!editing}
            guard={editing}
            sites={siteList}
            defaultSite={site !== 'none' ? site : ''}
            onClose={() => {
              setAdding(false);
              setEditing(null);
            }}
            onSaved={refresh}
            onDisable={(g) => {
              setEditing(null);
              disable.reset();
              setDisabling(g);
            }}
          />
          <ConfirmDialog
            // A new dialog for each guard, so the title change does not lock the first tap.
            key={disabling?.id ?? 'none'}
            open={!!disabling}
            onOpenChange={(o) => !o && !disable.isPending && setDisabling(null)}
            title={`Disable ${disabling?.name ?? ''}?`}
            lines={[{ label: 'Guard', value: disabling?.id ?? '' }]}
            description="They stay in the list, greyed out. New attendance stops. History is kept."
            okLabel="Disable guard"
            danger
            pending={disable.isPending}
            error={disable.error ? errorText(disable.error) : null}
            onConfirm={() => disabling && disable.mutate(disabling)}
          />
        </>
      )}
    </Page>
  );
}
