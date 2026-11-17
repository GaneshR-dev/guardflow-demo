import { fmtTime } from '@/lib/format';

// The status text of a row and its colour (docs/GLOSSARY.md).
export function statusOf(r: { status: string; check_in: string | null; check_out: string | null }) {
  if (r.status === 'checked_in') return { text: `Checked in ${fmtTime(r.check_in)}`, tone: 'text-green-text' };
  if (r.status === 'completed')
    return { text: `${fmtTime(r.check_in)} – ${fmtTime(r.check_out)}`, tone: 'text-muted-foreground' };
  return { text: 'Not checked in', tone: 'text-amber-text' };
}
