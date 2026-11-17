import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, friendlyError, isApiError } from '@/lib/api';
import { shortLoc } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { AddGuardAnswer, Employee, Location } from '@/types/api';
import { useSingleSubmit } from '@/lib/useSingleSubmit';

interface Props {
  open: boolean;
  // Edit this guard. Without it, the sheet adds a new guard.
  guard?: Employee | null;
  // A fixed site (Attendance): the sheet has no site field.
  site?: { id: string; name: string };
  // The sites for the site field. Only active sites can get a guard.
  sites?: Location[];
  // The first value of the site field when the sheet adds a guard ('' = no site yet).
  defaultSite?: string;
  onClose: () => void;
  onSaved: () => void;
  // Edit only: the "Disable guard" button. The caller asks for a confirmation.
  onDisable?: (guard: Employee) => void;
}

const FIELD = 'h-12 rounded-xl border-line bg-field px-3.5 text-base';

// Admin only: add a guard, or edit the name, phone and site of a guard.
export function GuardSheet(props: Props) {
  const { open, guard, onClose } = props;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90svh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl">
        {open && <GuardForm key={guard?.id ?? 'new'} {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function GuardForm({ guard, site, sites = [], defaultSite = '', onClose, onSaved, onDisable }: Props) {
  const editing = !!guard;
  const start = {
    name: guard?.name ?? '',
    phone: guard?.phone ?? '',
    site: site?.id ?? guard?.location_id ?? defaultSite,
  };
  const [values, setValues] = useState(start);
  const changed = values.name !== start.name || values.phone !== start.phone || values.site !== start.site;
  const moved = editing && values.site !== start.site;
  const choices = sites.filter((l) => l.active || l.id === start.site);

  const once = useSingleSubmit();
  const save = useMutation({
    mutationFn: () =>
      api<AddGuardAnswer>(guard ? `/api/employees/${encodeURIComponent(guard.id)}` : '/api/employees', {
        method: guard ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: values.name.trim(),
          phone: values.phone.trim(),
          location_id: values.site || null,
        }),
      }),
    onSuccess: (r) => {
      toast(r.warning || `${editing ? 'Guard saved' : 'Guard added'} · ${values.name.trim()}`);
      onSaved();
      onClose();
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing || changed) once(() => save.mutateAsync());
  };
  const error = save.error && friendlyError(isApiError(save.error) ? save.error.status : 0, save.error.message);
  const set = (k: keyof typeof values) => (v: string) => setValues((old) => ({ ...old, [k]: v }));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 px-5 pb-6">
      <SheetHeader className="px-0 pt-5 pb-0">
        <SheetTitle className="text-lg font-bold text-text">{guard ? `Edit ${guard.name}` : 'Add a guard'}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {guard ? `Guard ID ${guard.id}.` : site ? `The guard joins ${site.name}.` : 'The app gives the guard ID.'}
        </SheetDescription>
      </SheetHeader>
      <ErrorBanner message={error} />
      <fieldset disabled={save.isPending} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ag-name">Name</Label>
          <Input
            id="ag-name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            value={values.name}
            onChange={(e) => set('name')(e.target.value)}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ag-phone">Phone</Label>
          <Input
            id="ag-phone"
            type="tel"
            required
            minLength={7}
            maxLength={25}
            pattern="[0-9+\(\) \-]+"
            title="Use digits, spaces, +, - and brackets."
            inputMode="tel"
            value={values.phone}
            onChange={(e) => set('phone')(e.target.value)}
            className={FIELD}
          />
        </div>
        {!site && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ag-site">Site</Label>
            <select
              id="ag-site"
              value={values.site}
              onChange={(e) => set('site')(e.target.value)}
              aria-describedby={moved ? 'ag-site-note' : undefined}
              className={`${FIELD} w-full border hover:border-blue/40 focus-visible:outline-2 focus-visible:outline-blue`}
            >
              <option value="">No site yet</option>
              {choices.map((l) => (
                <option key={l.id} value={l.id}>
                  {shortLoc(l.name)}
                </option>
              ))}
            </select>
            {moved && (
              <small id="ag-site-note" className="text-[13px] text-muted-foreground">
                The attendance history stays at the old site.
              </small>
            )}
          </div>
        )}
      </fieldset>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="h-12"
          disabled={save.isPending || (editing && !changed)}
          aria-busy={save.isPending || undefined}
        >
          {save.isPending ? 'Saving…' : editing ? 'Save' : 'Add guard'}
        </Button>
      </div>
      {guard && onDisable && (
        <Button
          type="button"
          variant="outline"
          className="h-12 text-red-text"
          disabled={save.isPending}
          onClick={() => onDisable(guard)}
        >
          Disable guard
        </Button>
      )}
    </form>
  );
}
