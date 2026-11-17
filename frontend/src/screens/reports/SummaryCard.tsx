import { ProgressBar } from '@/components/ProgressBar';
import { percent } from '@/lib/coverage';
import { fmtCount } from '@/lib/format';
import type { SummaryBucket } from '@/types/api';

// "619 of 640 completed · 97%", a bar, and "21 open · avg shift 9.0 h". Each number one time.
export function SummaryCard({ t }: { t: SummaryBucket }) {
  const open = t.records - t.completed;
  return (
    <section aria-label="Month summary" className="rounded-2xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <strong className="text-base">
          {fmtCount(t.completed)} of {fmtCount(t.records)} completed
        </strong>
        <span className="text-sm font-semibold text-muted-foreground tabular-nums">
          {percent(t.completed, t.records)}%
        </span>
      </div>
      <div className="mt-3">
        <ProgressBar value={percent(t.completed, t.records)} />
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">
        {open ? <strong className="text-amber-text">{fmtCount(open)} open</strong> : 'Nothing open'}
        {t.avg_hours ? ` · avg shift ${t.avg_hours.toFixed(1)} h` : ''}
      </p>
    </section>
  );
}
