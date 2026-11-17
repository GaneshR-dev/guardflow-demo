import { BarChart3, Download } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { ProgressBar } from '@/components/ProgressBar';
import { Button } from '@/components/ui/button';
import { percent } from '@/lib/coverage';
import { fmtCount, fmtMonth } from '@/lib/format';
import type { HistoryMonth } from '@/types/api';
import { thisMonth } from './data';

interface Props {
  months: HistoryMonth[];
  admin: boolean;
  downloading: string | null;
  onDownload: (month: string) => void;
  onThisMonth: () => void;
}

export function HistoryReportView({ months, admin, downloading, onDownload, onThisMonth }: Props) {
  if (!months.some((m) => m.total_records))
    return (
      <EmptyState
        icon={<BarChart3 />}
        title="No history yet"
        text="Monthly reports show here after the first month of attendance. You can see this month on the Month tab."
      >
        <Button variant="outline" className="h-12 px-[22px]" onClick={onThisMonth}>
          Open this month
        </Button>
      </EmptyState>
    );
  const current = thisMonth();
  return (
    <>
      <div className="mb-2.5 flex items-center justify-between text-sm">
        <h2 className="text-base font-bold">Last 6 months</h2>
        <span className="text-muted-foreground">{admin ? 'All sites' : 'Your sites'}</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {months.map((m) => {
          const label = fmtMonth(new Date(m.month + '-01T00:00:00'));
          return (
            <li key={m.month} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="flex items-center gap-2">
                  <strong className="text-[15px]">{label}</strong>
                  {m.month === current && (
                    <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-text">
                      In progress
                    </span>
                  )}
                </span>
                <ProgressBar value={percent(m.completed, m.total_records)} />
                <small className="text-[13px] text-muted-foreground">
                  {fmtCount(m.completed)} of {fmtCount(m.total_records)} entries completed
                </small>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-blue"
                aria-label={`Download ${label} as Excel`}
                disabled={!m.total_records || downloading === m.month}
                aria-busy={downloading === m.month || undefined}
                onClick={() => onDownload(m.month)}
              >
                <Download className="size-5" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-center text-[13px] text-muted-foreground">
        Each download is one Excel file for the whole month.
      </p>
    </>
  );
}
