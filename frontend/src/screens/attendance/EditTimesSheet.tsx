import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, friendlyError, isApiError } from '@/lib/api';
import { fmtShift, fmtShortDay, locationShifts, shiftLabel, toHHMM } from '@/lib/format';
import { addDay, checkoutNextDay, shiftFor, shiftProblem } from '@/lib/shift';
import { toast } from '@/lib/toast';
import type { AttendanceRecord, Location } from '@/types/api';

interface Props {
  record: AttendanceRecord | null;
  // The site with its shift times. The shift fills the check-out time and limits it.
  site: Location;
  day: string;
  onClose: () => void;
  onSaved: () => void;
}

const FIELD = 'h-12 rounded-xl border-line bg-field px-3.5 text-base';

// Admin only: correct the check-in and check-out times of a record (IST). The app fills the check-out
// time from the shift and works out the check-out date, so the admin types as little as possible. The
// server checks the same shift rule again and saves the reason in the activity log.
export function EditTimesSheet({ record, site, day, onClose, onSaved }: Props) {
  return (
    <Sheet open={!!record} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90svh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl">
        {record && (
          <EditTimesForm
            key={record.id ?? record.employee_id}
            record={record}
            site={site}
            day={day}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditTimesForm({ record, site, day, onClose, onSaved }: Props & { record: AttendanceRecord }) {
  const shifts = locationShifts(site);
  const [values, setValues] = useState({
    day,
    check_in: toHHMM(record.check_in),
    check_out: toHHMM(record.check_out),
    reason: '',
  });
  // After the admin types a check-out time, a new check-in time does not change it any more.
  const [outTyped, setOutTyped] = useState(false);

  const shift = shiftFor(shifts, values.check_in);
  const problem = shiftProblem(shift, values.check_in, values.check_out);
  const endText = shift ? fmtShift(shift.endHHMM) : '';
  const nextDay = checkoutNextDay(values.check_in, values.check_out);

  const setCheckIn = (checkIn: string) =>
    setValues((v) => {
      const s = shiftFor(shifts, checkIn);
      // Fill the check-out time with the shift end, unless the admin typed one.
      return { ...v, check_in: checkIn, check_out: s && !outTyped ? s.endHHMM : v.check_out };
    });
  const setCheckOut = (checkOut: string, typed = true) => {
    setOutTyped(typed);
    setValues((v) => ({ ...v, check_out: checkOut }));
  };

  const save = useMutation({
    mutationFn: () =>
      api('/api/attendance/times', {
        method: 'PATCH',
        body: JSON.stringify({
          record_id: record.id,
          employee_id: record.employee_id,
          location_id: site.id,
          day: values.day,
          check_in: values.check_in,
          check_out: values.check_out || null,
          // The server works out the check-out date from the times.
          check_out_day: null,
          reason: values.reason.trim(),
        }),
      }),
    onSuccess: () => {
      toast(`Times saved · ${record.name}`);
      onSaved();
      onClose();
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!save.isPending && !problem) save.mutate();
  };
  const error = save.error && friendlyError(isApiError(save.error) ? save.error.status : 0, save.error.message);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 px-5 pb-6">
      <SheetHeader className="px-0 pt-5 pb-0">
        <SheetTitle className="text-lg font-bold text-text">Edit times · {record.name}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {shift
            ? `Shift ${fmtShift(shift.startHHMM)} – ${endText}. Times are in IST.`
            : shifts.length
              ? `Shift ${shiftLabel(site)}. Times are in IST.`
              : 'No shift set for this site. Times are in IST.'}{' '}
          Your reason goes to the activity log.
        </SheetDescription>
      </SheetHeader>
      <ErrorBanner message={error} />
      <fieldset disabled={save.isPending} className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="et-day">Date</Label>
          <Input
            id="et-day"
            type="date"
            required
            value={values.day}
            onChange={(e) => setValues((v) => ({ ...v, day: e.target.value }))}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-in">Check-in time</Label>
          <Input
            id="et-in"
            type="time"
            required
            value={values.check_in}
            onChange={(e) => setCheckIn(e.target.value)}
            aria-invalid={problem === 'check_in_after_end' || undefined}
            aria-describedby={problem === 'check_in_after_end' ? 'et-in-error' : undefined}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-out">Check-out time</Label>
          <Input
            id="et-out"
            type="time"
            value={values.check_out}
            onChange={(e) => setCheckOut(e.target.value)}
            aria-invalid={problem === 'check_out_after_end' || undefined}
            aria-describedby={problem === 'check_out_after_end' ? 'et-out-error' : 'et-out-day'}
            className={FIELD}
          />
        </div>
        {problem === 'check_in_after_end' && (
          <p id="et-in-error" role="alert" className="col-span-2 -mt-1 text-[13px] font-semibold text-red-text">
            Check-in is after the shift end ({endText}). Check the time.
          </p>
        )}
        {problem === 'check_out_after_end' && (
          <p id="et-out-error" role="alert" className="col-span-2 -mt-1 text-[13px] font-semibold text-red-text">
            Check-out must be at or before the shift end ({endText}).
          </p>
        )}
        <div className="col-span-2 -mt-1 flex flex-wrap items-center justify-between gap-x-3">
          <span id="et-out-day" className="text-[13px] text-muted-foreground">
            {values.check_out
              ? `Check-out: ${fmtShortDay(nextDay ? addDay(values.day) : values.day)}${nextDay ? ' (next day)' : ''}`
              : 'No check-out: the guard is still at work.'}
          </span>
          <span className="flex gap-3">
            {shift && values.check_out !== shift.endHHMM && (
              <Button
                type="button"
                variant="link"
                className="h-11 px-0 text-blue"
                onClick={() => setCheckOut(shift.endHHMM, false)}
              >
                Use shift end
              </Button>
            )}
            {values.check_out && (
              <Button type="button" variant="link" className="h-11 px-0 text-blue" onClick={() => setCheckOut('')}>
                Still at work
              </Button>
            )}
          </span>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="et-reason">Reason</Label>
          <Textarea
            id="et-reason"
            required
            minLength={3}
            maxLength={200}
            rows={3}
            placeholder="For example: the guard did not check out"
            value={values.reason}
            onChange={(e) => setValues((v) => ({ ...v, reason: e.target.value }))}
            className="min-h-24 resize-none rounded-xl border-line bg-field px-3.5 py-3 text-base"
          />
          <small className="self-end text-xs text-muted-foreground tabular-nums">{values.reason.length}/200</small>
        </div>
      </fieldset>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="h-12"
          disabled={save.isPending || !!problem}
          aria-busy={save.isPending || undefined}
        >
          {save.isPending ? 'Saving…' : 'Save times'}
        </Button>
      </div>
    </form>
  );
}
