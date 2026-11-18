import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, friendlyError, isApiError } from '@/lib/api';
import { newShiftRow, shiftRowsBody, shiftRowsProblem, type ShiftRow } from '@/lib/shift';
import { toast } from '@/lib/toast';
import { useSingleSubmit } from '@/lib/useSingleSubmit';
import type { Location } from '@/types/api';
import { useSettings } from '../settings/data';
import { ShiftFields } from './ShiftFields';

const FIELD = 'h-12 rounded-xl border-line bg-field px-3.5 text-base';
const UNASSIGNED = '__unassigned__';

interface Props {
  open: boolean;
  // Edit this site (name and area). Without it, the sheet adds a new site.
  site?: Location | null;
  onClose: () => void;
  // The ID of the new or changed site.
  onSaved: (id: string) => void;
}

// Admin only: add a site (name, area, shifts, one supervisor), or edit the name and area of a site.
export function SiteSheet(props: Props) {
  return (
    <Sheet open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90svh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl">
        {props.open && <SiteForm key={props.site?.id ?? 'new'} {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function SiteForm({ site, onClose, onSaved }: Props) {
  const start = { name: site?.name ?? '', area: site?.area ?? '' };
  const [values, setValues] = useState(start);
  const [rows, setRows] = useState<ShiftRow[]>(() => [newShiftRow()]);
  const [supervisor, setSupervisor] = useState('');
  const settings = useSettings();
  const supervisors = (settings.data?.access || []).filter((u) => u.role === 'supervisor' && u.active !== 0);

  const changed = values.name.trim() !== start.name || values.area.trim() !== start.area;
  const problem = site ? null : shiftRowsProblem(rows);
  const once = useSingleSubmit();
  const save = useMutation({
    mutationFn: () =>
      site
        ? api<{ id: string }>(`/api/settings/locations/${encodeURIComponent(site.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: values.name.trim(), area: values.area.trim() }),
          })
        : api<{ id: string }>('/api/settings/locations', {
            method: 'POST',
            body: JSON.stringify({
              name: values.name.trim(),
              area: values.area.trim(),
              shifts: shiftRowsBody(rows),
              supervisor_id: supervisor === UNASSIGNED ? null : supervisor,
            }),
          }),
    onSuccess: (r) => {
      toast(`${site ? 'Site saved' : 'Site added'} · ${values.name.trim()}`);
      onSaved(r.id);
      onClose();
    },
  });
  const blocked = save.isPending || !!problem || (site ? !changed : false);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!blocked) once(() => save.mutateAsync());
  };
  const error = save.error && friendlyError(isApiError(save.error) ? save.error.status : 0, save.error.message);
  const set = (k: keyof typeof values) => (v: string) => setValues((old) => ({ ...old, [k]: v }));

  const supervisorHelp = settings.error
    ? 'Could not load the supervisors. You can leave the site unassigned and give access later in User access.'
    : settings.data && !supervisors.length
      ? 'No supervisor accounts yet. Leave the site unassigned, then add a supervisor in Settings › User access.'
      : 'Only this supervisor gets access to the new site. Change access later in User access.';

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 px-5 pb-6">
      <SheetHeader className="px-0 pt-5 pb-0">
        <SheetTitle className="text-lg font-bold text-text">{site ? 'Edit site' : 'Add a site'}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {site ? `Site ID ${site.id}. The attendance history does not change.` : 'The app gives the site ID.'}
        </SheetDescription>
      </SheetHeader>
      <ErrorBanner message={error} />
      <fieldset disabled={save.isPending} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="site-name">Name</Label>
          <Input
            id="site-name"
            required
            minLength={3}
            maxLength={100}
            autoComplete="off"
            placeholder="Bengaluru - HSR Layout"
            aria-describedby="site-name-help"
            value={values.name}
            onChange={(e) => set('name')(e.target.value)}
            className={FIELD}
          />
          <small id="site-name-help" className="text-[13px] text-muted-foreground">
            Write the city, a dash, then the site.
          </small>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="site-area">Area</Label>
          <Input
            id="site-area"
            required
            minLength={2}
            maxLength={100}
            autoComplete="off"
            placeholder="HSR Sector 2"
            value={values.area}
            onChange={(e) => set('area')(e.target.value)}
            className={FIELD}
          />
        </div>
        {!site && (
          <>
            <ShiftFields rows={rows} onChange={setRows} problem={problem} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-supervisor">Supervisor</Label>
              <select
                id="site-supervisor"
                required
                value={supervisor}
                disabled={settings.isPending}
                onChange={(e) => setSupervisor(e.target.value)}
                aria-describedby="site-supervisor-help"
                className={`${FIELD} w-full border hover:border-blue/40 focus-visible:outline-2 focus-visible:outline-blue`}
              >
                <option value="" disabled>
                  {settings.isPending ? 'Loading the supervisors…' : 'Choose a supervisor'}
                </option>
                {supervisors.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
                <option value={UNASSIGNED}>Leave unassigned</option>
              </select>
              <small id="site-supervisor-help" className="text-[13px] text-muted-foreground">
                {supervisorHelp}
              </small>
            </div>
          </>
        )}
      </fieldset>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-12" disabled={blocked} aria-busy={save.isPending || undefined}>
          {save.isPending ? 'Saving…' : site ? 'Save' : 'Add site'}
        </Button>
      </div>
    </form>
  );
}
