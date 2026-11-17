import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, friendlyError, isApiError } from '@/lib/api';
import { toHHMM } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { AttendanceRecord } from '@/types/api';

interface Props {
  record: AttendanceRecord | null;
  siteId: string;
  day: string;
  onClose: () => void;
  onSaved: () => void;
}

const FIELD = 'h-12 rounded-xl border-line bg-field px-3.5 text-base';

// Admin only: correct the check-in and check-out times of a record (IST). The server saves the
// reason in the activity log.
export function EditTimesSheet({ record, siteId, day, onClose, onSaved }: Props) {
  return (
    <Sheet open={!!record} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90svh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl">
        {record && (
          <EditTimesForm
            key={record.id ?? record.employee_id}
            record={record}
            siteId={siteId}
            day={day}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditTimesForm({ record, siteId, day, onClose, onSaved }: Props & { record: AttendanceRecord }) {
  const [values, setValues] = useState({
    day,
    check_in: toHHMM(record.check_in),
    check_out: toHHMM(record.check_out),
    check_out_day: day,
    reason: '',
  });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      api('/api/attendance/times', {
        method: 'PATCH',
        body: JSON.stringify({
          record_id: record.id,
          employee_id: record.employee_id,
          location_id: siteId,
          day: values.day,
          check_in: values.check_in,
          check_out: values.check_out || null,
          check_out_day: values.check_out ? values.check_out_day || null : null,
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
    if (!save.isPending) save.mutate();
  };
  const error = save.error && friendlyError(isApiError(save.error) ? save.error.status : 0, save.error.message);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 px-5 pb-6">
      <SheetHeader className="px-0 pt-5 pb-0">
        <SheetTitle className="text-lg font-bold text-text">Edit times · {record.name}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          Times are IST. The activity log saves your reason. For an overnight shift, pick the next day as the check-out
          date.
        </SheetDescription>
      </SheetHeader>
      <ErrorBanner message={error} />
      <fieldset disabled={save.isPending} className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="et-day">Date</Label>
          <Input id="et-day" type="date" required value={values.day} onChange={set('day')} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-in">Check-in time</Label>
          <Input id="et-in" type="time" required value={values.check_in} onChange={set('check_in')} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-out">Check-out time</Label>
          <Input id="et-out" type="time" value={values.check_out} onChange={set('check_out')} className={FIELD} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="et-out-day">Check-out date</Label>
          <Input
            id="et-out-day"
            type="date"
            value={values.check_out_day}
            onChange={set('check_out_day')}
            disabled={!values.check_out}
            className={FIELD}
          />
          <small className="text-xs text-muted-foreground">
            Leave the check-out time empty if the guard is still at work.
          </small>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="et-reason">Reason</Label>
          <Input
            id="et-reason"
            required
            minLength={3}
            maxLength={200}
            placeholder="For example: the guard did not check out"
            value={values.reason}
            onChange={set('reason')}
            className={FIELD}
          />
        </div>
      </fieldset>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-12" disabled={save.isPending} aria-busy={save.isPending || undefined}>
          {save.isPending ? 'Saving…' : 'Save times'}
        </Button>
      </div>
    </form>
  );
}
