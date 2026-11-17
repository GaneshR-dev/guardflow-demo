import { BarChart3, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { ProgressBar } from '@/components/ProgressBar';
import { Button } from '@/components/ui/button';
import { percent } from '@/lib/coverage';
import { fmtCount, locCity, plural, shortLoc } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MonthSummary, SiteBucket } from '@/types/api';
import { fmtHours, thisMonth } from './data';
import { SummaryCard } from './SummaryCard';

function SiteCard({ s, month }: { s: SiteBucket; month: string }) {
  const pct = percent(s.completed, s.records);
  const city = locCity(s.name);
  return (
    <li>
      <Link
        to={`/reports/sites/${encodeURIComponent(s.id)}?month=${month}`}
        className="tap-card flex flex-col gap-2.5 rounded-2xl border bg-card px-4 py-3.5 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        <span className="flex items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <strong className="text-[15px]">{shortLoc(s.name)}</strong>
            <small className="text-[13px] text-muted-foreground">
              {(city ? city + ' · ' : '') + plural(s.assigned_count, 'guard')}
            </small>
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              !s.records
                ? 'bg-soft text-muted-foreground'
                : pct === 100
                  ? 'bg-green-soft text-green-text'
                  : 'bg-amber-soft text-amber-text',
            )}
          >
            {s.records ? `${pct}%` : 'No records'}
          </span>
          <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
        <ProgressBar value={pct} />
        <span className="grid grid-cols-3 text-[13px] text-muted-foreground">
          <span>
            <strong className="block text-[15px] text-text tabular-nums">{fmtCount(s.records)}</strong>Records
          </span>
          <span>
            <strong className="block text-[15px] text-text tabular-nums">{fmtCount(s.records - s.completed)}</strong>
            Open
          </span>
          <span>
            <strong className="block text-[15px] text-text tabular-nums">{fmtHours(s.avg_hours)}</strong>Avg shift
          </span>
        </span>
      </Link>
    </li>
  );
}

export function MonthReportView({ data, onThisMonth }: { data: MonthSummary; onThisMonth: () => void }) {
  if (!data.totals.records)
    return (
      <EmptyState icon={<BarChart3 />} title="No attendance this month" text="Records show here when guards check in.">
        {data.month !== thisMonth() && (
          <Button className="h-12 px-[22px]" onClick={onThisMonth}>
            Go to this month
          </Button>
        )}
      </EmptyState>
    );
  return (
    <>
      <SummaryCard t={data.totals} />
      <h2 className="mt-6 mb-2.5 text-base font-bold">By site</h2>
      <ul className="flex flex-col gap-2.5">
        {data.locations.map((s) => (
          <SiteCard key={s.id} s={s} month={data.month} />
        ))}
      </ul>
    </>
  );
}
