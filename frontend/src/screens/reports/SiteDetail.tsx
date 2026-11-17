import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight, Download } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Page } from '@/layout/AppShell';
import { api, friendlyError, isApiError } from '@/lib/api';
import { fmtMonth, locCity, plural, shortLoc, todayISO } from '@/lib/format';
import type { Location } from '@/types/api';
import { thisMonth, useExcel, useMonthReport } from './data';
import { SummaryCard } from './SummaryCard';

// One site for one month: the summary and one row for each day. A day opens the Day tab.
export function SiteDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const month = params.get('month') || thisMonth();
  const sites = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') });
  const site = sites.data?.find((l) => l.id === id);
  const report = useMonthReport(month, id, true);
  const excel = useExcel();
  const assigned = site?.assigned_count || 0;
  const city = locCity(site?.name);
  const today = todayISO();
  const d = report.data;

  let body;
  if (report.isPending) body = <LoadingRows label="Loading the days…" rows={7} />;
  else if (!d)
    body = <ScreenError error={report.error} atLocation what="the report" onRetry={() => report.refetch()} />;
  else if (!d.totals.records)
    body = (
      <EmptyState
        icon={<BarChart3 />}
        title="No attendance this month"
        text="Records show here when guards check in."
      />
    );
  else
    body = (
      <>
        <SummaryCard t={d.totals} />
        <h2 className="mt-6 mb-2.5 text-base font-bold">By day</h2>
        <ul className="flex flex-col gap-2.5">
          {d.days.map((x) => {
            const dt = new Date(x.day + 'T00:00:00');
            const present = x.completed + x.checked_in;
            const open = x.checked_in || x.not_in;
            const missing = assigned - x.records;
            const sub = open
              ? `${x.completed} checked out · ${x.checked_in} checked in · ${x.not_in} not checked in`
              : `All shifts completed${missing > 0 ? ` · ${missing} no record` : ''}`;
            return (
              <li key={x.day}>
                <button
                  type="button"
                  onClick={() => navigate(`/reports?date=${x.day}&site=${encodeURIComponent(id)}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                >
                  <span className="flex w-10 shrink-0 flex-col items-center leading-tight">
                    <strong className="text-lg">{dt.getDate()}</strong>{' '}
                    <small className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(dt)}
                    </small>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="text-[15px]">
                      {present} of {assigned || x.records} present
                    </strong>
                    <small className="text-[13px] text-muted-foreground">{sub}</small>
                  </span>
                  {x.day === today && (
                    <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-text">
                      Today
                    </span>
                  )}
                  <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );

  return (
    <Page
      title={site ? shortLoc(site.name) : 'Site'}
      back={{ to: `/reports?tab=month&month=${month}`, label: 'Reports' }}
      action={
        <Button
          variant="outline"
          className="h-11 gap-1.5 px-3.5 text-blue"
          disabled={!d?.totals.records || excel.isPending}
          aria-busy={excel.isPending || undefined}
          onClick={() => excel.mutate({ month, site: id })}
        >
          <Download className="size-[18px]" aria-hidden="true" />
          Excel
        </Button>
      }
      context={
        <p className="text-sm text-muted-foreground">
          {(city ? city + ' · ' : '') + plural(assigned, 'guard') + ' · ' + fmtMonth(new Date(month + '-01T00:00:00'))}
        </p>
      }
    >
      {excel.error && (
        <ErrorBanner
          message={`Could not download the Excel file. ${friendlyError(isApiError(excel.error) ? excel.error.status : 0, excel.error.message)}`}
        />
      )}
      {body}
    </Page>
  );
}
