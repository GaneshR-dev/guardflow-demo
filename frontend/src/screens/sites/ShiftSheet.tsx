import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, friendlyError, isApiError } from '@/lib/api';
import { locationShifts, shortLoc } from '@/lib/format';
import { newShiftRow, shiftRowsBody, shiftRowsProblem, type ShiftRow } from '@/lib/shift';
import { toast } from '@/lib/toast';
import { useSingleSubmit } from '@/lib/useSingleSubmit';
import type { Location } from '@/types/api';
import { ShiftFields } from './ShiftFields';

interface Props {
  open: boolean;
  site: Location;
  onClose: () => void;
  onSaved: () => void;
}

// Admin only: replace the shifts of a site. The server checks the same rules again.
export function ShiftSheet({ open, site, onClose, onSaved }: Props) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90svh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl">
        {open && <ShiftForm site={site} onClose={onClose} onSaved={onSaved} />}
      </SheetContent>
    </Sheet>
  );
}

function ShiftForm({ site, onClose, onSaved }: Omit<Props, 'open'>) {
  const [rows, setRows] = useState<ShiftRow[]>(() => {
    const now = locationShifts(site);
    return now.length ? now.map((s) => newShiftRow(s)) : [newShiftRow()];
  });
  const before = JSON.stringify(locationShifts(site).map((s) => [s.shift_start, s.shift_end]));
  const body = shiftRowsBody(rows);
  const changed = JSON.stringify(body.map((s) => [s.shift_start, s.shift_end])) !== before;
  const problem = shiftRowsProblem(rows);
  const once = useSingleSubmit();
  const save = useMutation({
    mutationFn: () =>
      api(`/api/settings/locations/${encodeURIComponent(site.id)}/shifts`, {
        method: 'PUT',
        body: JSON.stringify({ shifts: body }),
      }),
    onSuccess: () => {
      toast(`Shifts saved · ${shortLoc(site.name)}`);
      onSaved();
      onClose();
    },
  });
  const blocked = save.isPending || !!problem || !changed;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!blocked) once(() => save.mutateAsync());
  };
  const error = save.error && friendlyError(isApiError(save.error) ? save.error.status : 0, save.error.message);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 px-5 pb-6">
      <SheetHeader className="px-0 pt-5 pb-0">
        <SheetTitle className="text-lg font-bold text-text">Edit shifts · {shortLoc(site.name)}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          The shift end limits the check-out time when an admin edits times. Past records do not change.
        </SheetDescription>
      </SheetHeader>
      <ErrorBanner message={error} />
      <fieldset disabled={save.isPending} className="contents">
        <ShiftFields rows={rows} onChange={setRows} problem={problem} />
      </fieldset>
      {!body.length && changed && (
        <p className="text-[13px] text-muted-foreground">Save with no shift to remove all shifts of this site.</p>
      )}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-12" disabled={blocked} aria-busy={save.isPending || undefined}>
          {save.isPending ? 'Saving…' : 'Save shifts'}
        </Button>
      </div>
    </form>
  );
}
