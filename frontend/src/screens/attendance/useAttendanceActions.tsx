import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { api, friendlyError, isApiError } from '@/lib/api';
import { nowTime, shortLoc } from '@/lib/format';
import { hoursWorked } from '@/lib/hours';
import { toast } from '@/lib/toast';
import type { CheckinAnswer, CheckoutAnswer } from '@/types/api';

type Guard = { id: string; name: string };

type Pending =
  | { kind: 'checkin'; guard: Guard; adhoc: boolean; time: string; priorShifts?: number }
  | { kind: 'checkout'; guard: Guard; time: string; hours: string; since?: string };

// Check-in and check-out with a confirmation dialog. A 403 closes the dialog and calls
// `onBlocked`, so the screen shows "No access to this site". Other errors stay in the dialog.
export function useAttendanceActions(site: { id: string; name: string } | null, onBlocked: (err: unknown) => void) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['lookup'] });
  };
  const fail = (err: unknown) => {
    if (isApiError(err) && err.status === 403) {
      setPending(null);
      onBlocked(err);
    }
  };

  const checkin = useMutation({
    mutationFn: (v: { guard: Guard; confirm: boolean }) =>
      api<CheckinAnswer>('/api/attendance/checkin', {
        method: 'POST',
        body: JSON.stringify({ employee_id: v.guard.id, location_id: site?.id, confirm_second_shift: v.confirm }),
      }),
    onSuccess: (r, v) => {
      if (r.requires_confirmation) {
        // The guard already finished a shift today. Ask again before a second shift starts.
        setPending((p) => (p?.kind === 'checkin' ? { ...p, priorShifts: r.prior_shifts ?? 1 } : p));
        return;
      }
      toast(`Check-in recorded · ${v.guard.name}`);
      setPending(null);
      refresh();
    },
    onError: fail,
  });

  const checkout = useMutation({
    mutationFn: (guard: Guard) =>
      api<CheckoutAnswer>('/api/attendance/checkout', {
        method: 'POST',
        body: JSON.stringify({ employee_id: guard.id, location_id: site?.id }),
      }),
    onSuccess: (r, guard) => {
      toast(r.note ? `Check-out recorded · ${guard.name}. ${r.note}` : `Check-out recorded · ${guard.name}`);
      setPending(null);
      refresh();
    },
    onError: fail,
  });

  const askCheckin = (guard: Guard, adhoc = false) => {
    checkin.reset();
    setPending({ kind: 'checkin', guard, adhoc, time: nowTime() });
  };
  const askCheckout = (guard: Guard, checkIn: string | null, since?: string) => {
    checkout.reset();
    setPending({ kind: 'checkout', guard, time: nowTime(), hours: hoursWorked(checkIn, Date.now()), since });
  };

  const err: unknown = pending?.kind === 'checkout' ? checkout.error : checkin.error;
  const error = err
    ? friendlyError(isApiError(err) ? err.status : 0, err instanceof Error ? err.message : 'Request failed')
    : null;
  const siteName = site ? shortLoc(site.name) : '';

  let dialog = null;
  if (pending?.kind === 'checkin' && pending.priorShifts)
    dialog = (
      <ConfirmDialog
        open
        onOpenChange={(o) => !o && setPending(null)}
        title="Second shift today"
        description="This guard already finished a shift today. Check in for one more shift?"
        lines={[
          { label: 'Guard', value: `${pending.guard.name} (${pending.guard.id})` },
          { label: 'Shifts checked out today', value: String(pending.priorShifts) },
          { label: 'Site', value: siteName },
        ]}
        okLabel="Check in"
        pending={checkin.isPending}
        error={error}
        onConfirm={() => checkin.mutate({ guard: pending.guard, confirm: true })}
      />
    );
  else if (pending?.kind === 'checkin')
    dialog = (
      <ConfirmDialog
        open
        onOpenChange={(o) => !o && setPending(null)}
        title="Confirm check-in"
        lines={[
          { label: 'Guard', value: `${pending.guard.name} (${pending.guard.id})` },
          { label: 'Check-in time', value: `${pending.time} IST` },
          { label: 'Site', value: siteName + (pending.adhoc ? ' · ad hoc shift' : '') },
        ]}
        okLabel="Check in"
        pending={checkin.isPending}
        error={error}
        onConfirm={() => checkin.mutate({ guard: pending.guard, confirm: false })}
      />
    );
  else if (pending?.kind === 'checkout')
    dialog = (
      <ConfirmDialog
        open
        onOpenChange={(o) => !o && setPending(null)}
        title="Confirm check-out"
        lines={[
          { label: 'Guard', value: `${pending.guard.name} (${pending.guard.id})` },
          ...(pending.since ? [{ label: 'Checked in on', value: pending.since }] : []),
          { label: 'Check-out time', value: `${pending.time} IST` },
          { label: 'Hours worked', value: pending.hours },
        ]}
        okLabel="Check out"
        pending={checkout.isPending}
        error={error}
        onConfirm={() => checkout.mutate(pending.guard)}
      />
    );

  return { askCheckin, askCheckout, dialog };
}
