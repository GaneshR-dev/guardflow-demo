import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { LocationSheet } from '@/components/LocationSheet';
import { ScreenError } from '@/components/ScreenError';
import { Page } from '@/layout/AppShell';
import { api, friendlyError, isApiError } from '@/lib/api';
import { fmtShortDay, fmtShortMonth, fmtTime, shortLoc, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Location } from '@/types/api';
import {
  thisMonth,
  useDayReport,
  useExcel,
  useHistory,
  useMonthReport,
  type DayFilter,
  type Tab,
} from './reports/data';
import { DayReportView } from './reports/DayReport';
import { ExcelButton } from './reports/ExcelButton';
import { HistoryReportView } from './reports/HistoryReport';
import { MonthReportView } from './reports/MonthReport';
import { PeriodButton } from './reports/PeriodButton';

const TABS: { key: Tab; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'month', label: 'Month' },
  { key: 'history', label: 'History' },
];
const STATUSES: DayFilter[] = ['all', 'checked_in', 'completed', 'not_in'];

const errorMessage = (e: unknown) =>
  friendlyError(isApiError(e) ? e.status : 0, e instanceof Error ? e.message : 'Request failed');

export function Reports() {
  const session = useSession();
  const admin = uiRole(session) === 'admin';
  const [params, setParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  // The tab and the filters are in the URL, so a reload keeps them.
  const tab = (['day', 'month', 'history'].includes(params.get('tab') || '') ? params.get('tab') : 'day') as Tab;
  const date = params.get('date') || todayISO();
  const month = params.get('month') || thisMonth();
  const status = (STATUSES.includes(params.get('status') as DayFilter) ? params.get('status') : 'all') as DayFilter;
  const set = (changes: Record<string, string>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  const sites = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') });
  const active = (sites.data || []).filter((l) => l.active);
  // Day: one site (default: the first active site). Month: all sites ('') or one site.
  const daySite = params.get('site') || active[0]?.id || '';
  const monthSite = params.get('site') || '';
  const site = tab === 'day' ? daySite : monthSite;
  const siteRow = (sites.data || []).find((l) => l.id === site);

  const day = useDayReport(daySite, date, tab === 'day');
  const monthData = useMonthReport(month, monthSite, tab === 'month');
  const history = useHistory(tab === 'history');
  const excel = useExcel();
  const current = tab === 'day' ? day : tab === 'month' ? monthData : history;

  const hasRecords =
    tab === 'day' ? !!day.data?.rows.length : tab === 'month' ? !!monthData.data?.totals.records : false;
  const excelButton =
    tab === 'history' ? undefined : (
      <ExcelButton
        disabled={!hasRecords || current.isFetching}
        busy={excel.isPending}
        onClick={() =>
          excel.mutate(
            tab === 'day' ? { month: date.slice(0, 7), day: date, site: daySite } : { month, site: monthSite },
          )
        }
      />
    );

  // A segmented control: a grey track, the selected tab is a white pill. Each button is 44 px high;
  // the pill inside it is smaller, so the touch target stays 44 px.
  const tabs = (
    <div role="group" aria-label="Report type" className="grid h-11 w-full grid-cols-3 rounded-xl bg-line">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={tab === t.key}
          onClick={() => {
            excel.reset();
            set({ tab: t.key === 'day' ? '' : t.key, site: '', status: '' });
          }}
          className="group h-11 rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-blue"
        >
          <span
            className={cn(
              'flex h-full items-center justify-center rounded-lg text-sm font-semibold text-muted-foreground',
              tab === t.key && 'bg-card font-bold text-text shadow-[0_1px_3px_rgba(20,45,90,0.16)]',
            )}
          >
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );

  const siteLabel = siteRow ? shortLoc(siteRow.name) : tab === 'month' ? 'All sites' : 'Choose site';
  const filters =
    tab === 'history' ? null : (
      <div className="mb-4 flex gap-2.5">
        <PeriodButton
          type={tab === 'day' ? 'date' : 'month'}
          value={tab === 'day' ? date : month}
          label={tab === 'day' ? fmtShortDay(date) : fmtShortMonth(month)}
          onChange={(v) => set(tab === 'day' ? { date: v, status: '' } : { month: v })}
        />
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Change site, now ${siteLabel}`}
          onClick={() => setSheetOpen(true)}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card px-3 text-[15px] font-semibold text-text focus-visible:outline-2 focus-visible:outline-blue"
        >
          <MapPin className="size-[18px] shrink-0 text-blue" aria-hidden="true" />
          <span className="truncate">{siteLabel}</span>
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    );

  const loadedAt = current.dataUpdatedAt ? fmtTime(new Date(current.dataUpdatedAt).toISOString()) : undefined;
  const goToday = () => set({ date: '', status: '' });
  let body;
  if (sites.isPending && tab !== 'history') body = <LoadingRows label="Loading your sites…" rows={4} />;
  else if (tab === 'day' && !daySite)
    body = sites.error ? (
      <ScreenError error={sites.error} what="your sites" onRetry={() => sites.refetch()} />
    ) : (
      <EmptyState
        icon={<MapPin />}
        title="No sites yet"
        text={admin ? 'Add a site to see its reports.' : 'You have no site. Ask an admin to give you access to a site.'}
      />
    );
  else if (current.isPending)
    body = (
      <LoadingRows
        label={
          tab === 'history'
            ? 'Loading the history…'
            : `Loading the ${siteRow ? shortLoc(siteRow.name) + ' ' : ''}report…`
        }
        rows={tab === 'day' ? 7 : 5}
      />
    );
  else if (!current.data)
    body = (
      <ScreenError
        error={current.error}
        atLocation={tab !== 'history' && !!site}
        what={tab === 'history' ? 'the history' : 'the report'}
        onRetry={() => current.refetch()}
        onChooseLocation={() => setSheetOpen(true)}
        onReset={
          tab === 'history'
            ? undefined
            : { label: 'Go to today', action: () => set({ date: '', month: '', status: '' }) }
        }
        loadedAt={loadedAt}
      />
    );
  else if (tab === 'day')
    body = (
      <DayReportView
        key={`${daySite}|${date}`}
        rows={day.data!.rows}
        date={date}
        site={siteRow}
        status={status}
        onStatus={(s) => set({ status: s === 'all' ? '' : s })}
        onToday={goToday}
        onChooseSite={() => setSheetOpen(true)}
      />
    );
  else if (tab === 'month') body = <MonthReportView data={monthData.data!} onThisMonth={() => set({ month: '' })} />;
  else
    body = (
      <HistoryReportView
        months={history.data!}
        admin={admin}
        downloading={excel.isPending ? (excel.variables?.month ?? null) : null}
        onDownload={(m) => excel.mutate({ month: m })}
        onThisMonth={() => set({ tab: 'month', month: '' })}
      />
    );

  return (
    <Page title="Reports" action={excelButton} context={tabs}>
      {excel.error && <ErrorBanner message={`Could not download the Excel file. ${errorMessage(excel.error)}`} />}
      {current.error && current.data && <ErrorBanner message={`Could not refresh. ${errorMessage(current.error)}`} />}
      {filters}
      {body}
      <LocationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        locations={tab === 'day' ? active : sites.data || []}
        current={site}
        withAll={tab === 'month'}
        onPick={(id) => {
          setSheetOpen(false);
          set({ site: id, status: '' });
        }}
      />
    </Page>
  );
}
