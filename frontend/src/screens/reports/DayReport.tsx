import { CalendarX2, MapPin } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { StatTile } from '@/components/StatTile';
import { Button } from '@/components/ui/button';
import { fmtDate, fmtTime, plural, shortLoc, STATUS_LABEL, todayISO } from '@/lib/format';
import { TONE_TEXT } from '@/lib/tone';
import type { Location, ReportRow } from '@/types/api';
import { GuardCard, GuardList } from '../attendance/AttendanceRow';
import { fmtHours, type DayFilter } from './data';

interface Props {
  rows: ReportRow[];
  date: string;
  site: Location | undefined;
  status: DayFilter;
  onStatus: (s: DayFilter) => void;
  onToday: () => void;
  onChooseSite: () => void;
}

const FILTERS: { key: DayFilter; label: string; tone?: 'green' | 'grey' | 'amber' }[] = [
  { key: 'all', label: 'All entries' },
  { key: 'checked_in', label: 'Checked in', tone: 'green' },
  { key: 'completed', label: 'Checked out', tone: 'grey' },
  { key: 'not_in', label: 'Not checked in', tone: 'amber' },
];

function rowStatus(r: ReportRow) {
  if (r.status === 'completed')
    return { text: `${fmtTime(r.check_in)} – ${fmtTime(r.check_out)} · ${fmtHours(r.hours)}`, tone: TONE_TEXT.grey };
  if (r.status === 'checked_in') return { text: `Checked in ${fmtTime(r.check_in)}`, tone: TONE_TEXT.green };
  return { text: STATUS_LABEL.not_in, tone: TONE_TEXT.amber };
}

// One day at one site. The status filter works on the phone, with no new request.
export function DayReportView({ rows, date, site, status, onStatus, onToday, onChooseSite }: Props) {
  const today = todayISO();
  if (!rows.length) {
    if (date === today)
      return (
        <EmptyState
          icon={<MapPin />}
          title="No guards at this site"
          text={`${site ? shortLoc(site.name) : 'This site'} has no active guards. Choose another site, or add guards.`}
        >
          <Button variant="outline" className="h-12 px-[22px]" onClick={onChooseSite}>
            Choose site
          </Button>
        </EmptyState>
      );
    const future = date > today;
    return (
      <EmptyState
        icon={<CalendarX2 />}
        title={future ? 'No attendance for this day yet' : 'No attendance records'}
        text={
          future
            ? `${fmtDate(new Date(date + 'T00:00:00'))} is in the future. Records show here when guards check in.`
            : 'Nobody checked in at this site on this day.'
        }
      >
        <Button className="h-12 px-[22px]" onClick={onToday}>
          Go to today
        </Button>
      </EmptyState>
    );
  }

  const count = (k: DayFilter) => rows.filter((r) => k === 'all' || r.status === k).length;
  const shown = rows.filter((r) => status === 'all' || r.status === status);
  const hours = rows.map((r) => r.hours).filter((h): h is number => !!h);
  const avg = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
  // A guard can have more than one shift, so rows are entries, not guards.
  const guards = new Set(rows.map((r) => r.employee_id)).size;

  return (
    <>
      <div role="group" aria-label="Filter entries by status" className="grid grid-cols-2 gap-2.5">
        {FILTERS.map((f) => (
          <StatTile
            key={f.key}
            value={count(f.key)}
            label={f.label}
            tone={f.tone}
            pressed={status === f.key}
            onClick={() => onStatus(f.key)}
          />
        ))}
      </div>
      <div className="mt-4 mb-2.5 flex min-h-11 items-center justify-between gap-3 text-sm">
        <strong>
          {status === 'all'
            ? `${plural(guards, 'guard')} · ${plural(rows.length, 'entry', 'entries')}`
            : `${plural(shown.length, 'entry', 'entries')} · ${STATUS_LABEL[status].toLowerCase()}`}
        </strong>
        {status !== 'all' ? (
          <Button variant="link" className="h-11 px-0 text-blue" onClick={() => onStatus('all')}>
            Show all
          </Button>
        ) : avg ? (
          <span className="text-muted-foreground">Avg shift {avg.toFixed(1)} h</span>
        ) : null}
      </div>
      {shown.length ? (
        <GuardList>
          {shown.map((r, i) => (
            <GuardCard
              key={r.employee_id + (r.check_in || i)}
              name={r.employee_name}
              id={r.employee_id}
              status={rowStatus(r)}
            />
          ))}
        </GuardList>
      ) : (
        <p className="text-[13px] text-muted-foreground">Nobody in this group.</p>
      )}
    </>
  );
}
