import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, friendlyError, isApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { AddGuardAnswer } from '@/types/api';

interface Props {
  open: boolean;
  site: { id: string; name: string };
  onClose: () => void;
  onAdded: () => void;
}

const FIELD = 'h-12 rounded-xl border-line bg-field px-3.5 text-base';

// Admin only: add a new guard to this site.
export function AddGuardSheet({ open, site, onClose, onAdded }: Props) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[430px] rounded-t-3xl">
        {open && <AddGuardForm site={site} onClose={onClose} onAdded={onAdded} />}
      </SheetContent>
    </Sheet>
  );
}

function AddGuardForm({ site, onClose, onAdded }: Omit<Props, 'open'>) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api<AddGuardAnswer>('/api/employees', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), location_id: site.id }),
      }),
    onSuccess: (r) => {
      toast(r.warning || `Guard added · ${name.trim()}`);
      onAdded();
      onClose();
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!add.isPending) add.mutate();
  };
  const error = add.error && friendlyError(isApiError(add.error) ? add.error.status : 0, add.error.message);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 px-5 pb-6">
      <SheetHeader className="px-0 pt-5 pb-0">
        <SheetTitle className="text-lg font-bold text-text">Add a guard</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">The guard joins {site.name}.</SheetDescription>
      </SheetHeader>
      <ErrorBanner message={error} />
      <fieldset disabled={add.isPending} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ag-name">Name</Label>
          <Input
            id="ag-name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={FIELD}
          />
        </div>
      </fieldset>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" disabled={add.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-12" disabled={add.isPending} aria-busy={add.isPending || undefined}>
          {add.isPending ? 'Adding…' : 'Add guard'}
        </Button>
      </div>
    </form>
  );
}
