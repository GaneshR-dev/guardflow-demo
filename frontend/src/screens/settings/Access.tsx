import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { PasswordInput } from '@/components/PasswordInput';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Page } from '@/layout/AppShell';
import { api, friendlyError, isApiError } from '@/lib/api';
import { initials } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { AccessUser, SettingsAnswer } from '@/types/api';
import { siteName, useSettings } from './data';
import { SiteChecklist } from './SiteChecklist';
import { useSingleSubmit } from '@/lib/useSingleSubmit';

const FIELD = 'h-12 rounded-xl border-line bg-field px-3.5 text-base';
const ROLE: Record<string, string> = { admin: 'Admin', supervisor: 'Supervisor', owner: 'Owner' };

function sitesText(d: SettingsAnswer, u: AccessUser) {
  if (u.role !== 'supervisor') return { text: 'All sites', tone: 'text-muted-foreground' };
  if (!u.location_ids.length) return { text: 'No sites', tone: 'font-semibold text-amber-text' };
  return { text: u.location_ids.map((id) => siteName(d, id)).join(', '), tone: 'text-muted-foreground' };
}

// One user card. Admins open the user; supervisors only read.
function UserCard({ d, u, open }: { d: SettingsAnswer; u: AccessUser; open: boolean }) {
  const sites = sitesText(d, u);
  const disabled = u.active === 0;
  const body = (
    <>
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-soft text-[13px] font-bold text-blue-text"
      >
        {initials(u.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="text-base break-words">
          {u.name}
          {disabled && (
            <span className="ml-1.5 rounded-full bg-soft px-2 py-0.5 align-middle text-[11px] font-semibold text-muted-foreground">
              Disabled
            </span>
          )}
        </strong>
        <small className="text-[13px] text-muted-foreground">
          {u.id} · {ROLE[u.role] || u.role}
        </small>
        <small className={cn('text-[13px]', sites.tone)}>{sites.text}</small>
      </span>
      {open && <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  const box = cn('flex items-start gap-3 rounded-2xl border bg-card p-4', disabled && 'opacity-70');
  return (
    <li>
      {open ? (
        <Link
          to={`/settings/access/${encodeURIComponent(u.id)}`}
          className={cn(
            box,
            'tap-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

export function Access() {
  const session = useSession();
  const admin = uiRole(session) === 'admin';
  const settings = useSettings();
  const [adding, setAdding] = useState(false);
  const d = settings.data;

  let body;
  if (settings.isPending) body = <LoadingRows label="Loading user access…" rows={3} />;
  else if (!d) body = <ScreenError error={settings.error} what="user access" onRetry={() => settings.refetch()} />;
  else
    body = (
      <>
        <ul className="flex flex-col gap-2.5">
          {d.access.map((u) => (
            <UserCard key={u.id} d={d} u={u} open={admin && u.role === 'supervisor'} />
          ))}
        </ul>
        {!admin && <p className="mt-4 text-[13px] text-muted-foreground">Only admins can change access.</p>}
        {admin && <AddSupervisorSheet open={adding} d={d} onClose={() => setAdding(false)} />}
      </>
    );

  return (
    <Page
      title="User access"
      back={{ to: '/settings', label: 'Settings' }}
      action={
        admin && d ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-blue"
            aria-label="Add a supervisor"
            onClick={() => setAdding(true)}
          >
            <UserPlus className="size-[22px]" aria-hidden="true" />
          </Button>
        ) : undefined
      }
    >
      {body}
    </Page>
  );
}

function AddSupervisorSheet({ open, d, onClose }: { open: boolean; d: SettingsAnswer; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90svh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl">
        {open && <AddSupervisorForm d={d} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function AddSupervisorForm({ d, onClose }: { d: SettingsAnswer; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState({ id: '', name: '', password: '' });
  const [sites, setSites] = useState<string[]>([]);
  const once = useSingleSubmit();
  const add = useMutation({
    mutationFn: () =>
      api('/api/settings/access', {
        method: 'POST',
        body: JSON.stringify({
          id: v.id.trim(),
          name: v.name.trim(),
          password: v.password,
          role: 'supervisor',
          location_ids: sites,
        }),
      }),
    onSuccess: () => {
      toast(`Supervisor added · ${v.name.trim()}`);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      onClose();
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    once(() => add.mutateAsync());
  };
  const error = add.error && friendlyError(isApiError(add.error) ? add.error.status : 0, add.error.message);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 px-5 pb-6">
      <SheetHeader className="px-0 pt-5 pb-0">
        <SheetTitle className="text-lg font-bold text-text">Add a supervisor</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          The supervisor signs in with this user ID and password. Tell them the password yourself.
        </SheetDescription>
      </SheetHeader>
      <ErrorBanner message={error} />
      <fieldset disabled={add.isPending} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="as-id">User ID</Label>
          <Input
            id="as-id"
            required
            minLength={3}
            maxLength={80}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            value={v.id}
            onChange={(e) => setV({ ...v, id: e.target.value })}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="as-name">Name</Label>
          <Input
            id="as-name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="as-pw">Password</Label>
          <PasswordInput
            id="as-pw"
            required
            minLength={8}
            maxLength={100}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={v.password}
            onChange={(e) => setV({ ...v, password: e.target.value })}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Sites</span>
          <SiteChecklist sites={d.locations} value={sites} onChange={setSites} />
        </div>
      </fieldset>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" disabled={add.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-12" disabled={add.isPending} aria-busy={add.isPending || undefined}>
          {add.isPending ? 'Adding…' : 'Add supervisor'}
        </Button>
      </div>
    </form>
  );
}
