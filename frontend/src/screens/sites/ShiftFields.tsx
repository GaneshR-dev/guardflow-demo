import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { endsNextDay, MAX_SHIFTS, newShiftRow, type ShiftRow } from '@/lib/shift';

const FIELD = 'h-12 rounded-xl border-line bg-field px-3.5 text-base';

interface Props {
  rows: ShiftRow[];
  onChange: (rows: ShiftRow[]) => void;
  // The row with a problem, and the text. The text shows under that row.
  problem?: { row: number; text: string } | null;
}

// The shift rows of a site: up to 5, each with a start and an end time (IST). The label of a shift
// is kept but not shown, as in the old app.
export function ShiftFields({ rows, onChange, problem }: Props) {
  const set = (i: number, change: Partial<ShiftRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm font-semibold">
        Shifts
        <span className="text-[13px] font-normal text-muted-foreground tabular-nums">
          {rows.length}/{MAX_SHIFTS}
        </span>
      </legend>
      <p className="-mt-1 text-[13px] text-muted-foreground">
        Times are in IST. An end time before the start time ends the next day.
      </p>
      {rows.map((r, i) => {
        const bad = problem?.row === i;
        const errorId = `shift-${r.key}-error`;
        return (
          <div key={r.key} className="rounded-xl border bg-card p-3">
            <div className="mb-1 flex items-center justify-between">
              <strong className="text-sm">Shift {i + 1}</strong>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-my-1 -mr-1.5 size-11 text-muted-foreground"
                aria-label={`Remove shift ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-[18px]" aria-hidden="true" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`shift-${r.key}-start`}>Start time</Label>
                <Input
                  id={`shift-${r.key}-start`}
                  type="time"
                  value={r.start}
                  onChange={(e) => set(i, { start: e.target.value })}
                  aria-invalid={bad || undefined}
                  aria-describedby={bad ? errorId : undefined}
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`shift-${r.key}-end`}>End time</Label>
                <Input
                  id={`shift-${r.key}-end`}
                  type="time"
                  value={r.end}
                  onChange={(e) => set(i, { end: e.target.value })}
                  aria-invalid={bad || undefined}
                  aria-describedby={bad ? errorId : undefined}
                  className={FIELD}
                />
              </div>
            </div>
            {endsNextDay(r.start, r.end) && (
              <p className="mt-1.5 text-[13px] text-muted-foreground">Ends the next day.</p>
            )}
            {bad && (
              <p id={errorId} role="alert" className="mt-1.5 text-[13px] font-semibold text-red-text">
                {problem!.text}
              </p>
            )}
          </div>
        );
      })}
      {rows.length < MAX_SHIFTS && (
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-1.5 text-blue"
          onClick={() => onChange([...rows, newShiftRow()])}
        >
          <Plus className="size-[18px]" aria-hidden="true" />
          Add a shift
        </Button>
      )}
    </fieldset>
  );
}
