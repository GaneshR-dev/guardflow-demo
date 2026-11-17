import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { PasswordInput } from '@/components/PasswordInput';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Page } from '@/layout/AppShell';
import { api, ApiError, friendlyError, isApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useSingleSubmit } from '@/lib/useSingleSubmit';
import type { AccessChange, AccessUser as User, SettingsAnswer } from '@/types/api';
import { unsupervisedNote, useSettings } from './data';
import { SiteChecklist } from './SiteChecklist';

const errorText = (e: unknown) =>
  e ? friendlyError(isApiError(e) ? e.status : 0, e instanceof Error ? e.message : 'Request failed') : null;

// One supervisor: sites, a new password, and disable or enable access. Admin only; the server
// checks the same rules.
export function AccessUser() {
  const { id = '' } = useParams();
  const session = useSession();
  const admin = uiRole(session) === 'admin';
  const settings = useSettings();
  const d = settings.data;
  const user = d?.access.find((u) => u.id === id);

  let body;
  if (settings.isPending) body = <LoadingRows label="Loading the user…" rows={3} />;
  else if (!d) body = <ScreenError error={settings.error} what="the user" onRetry={() => settings.refetch()} />;
  else if (!admin) body = <ScreenError error={new ApiError('Admin required', 403)} />;
  else if (!user)
    body = (
      <EmptyState icon={<UserX />} title="User not found" text="This user no longer exists.">
        <Button asChild variant="outline" className="h-12 px-[22px]">
          <Link to="/settings/access">Show all users</Link>
        </Button>
      </EmptyState>
    );
  else body = <UserDetail key={user.id + user.location_ids.join()} d={d} user={user} />;

  return (
    <Page title={user?.name || 'User'} back={{ to: '/settings/access', label: 'User access' }}>
      {body}
    </Page>
  );
}

function UserDetail({ d, user }: { d: SettingsAnswer; user: User }) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['settings'] });
    queryClient.invalidateQueries({ queryKey: ['locations'] });
  };
  const [sites, setSites] = useState(user.location_ids);
  const [pwOpen, setPwOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const once = useSingleSubmit();
  const disabled = user.active === 0;
  const isSupervisor = user.role === 'supervisor';
  const changed = [...sites].sort().join() !== [...user.location_ids].sort().join();

  const saveSites = useMutation({
    mutationFn: () =>
      api<AccessChange>(`/api/settings/access/${encodeURIComponent(user.id)}/locations`, {
        method: 'PATCH',
        body: JSON.stringify({ location_ids: sites }),
      }),
    onSuccess: (r) => {
      toast(`Sites saved · ${user.name}.${unsupervisedNote(d, r.unsupervised)}`);
      refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: () =>
      api<AccessChange>(`/api/settings/access/${encodeURIComponent(user.id)}${disabled ? '/enable' : ''}`, {
        method: disabled ? 'POST' : 'DELETE',
        body: disabled ? '{}' : undefined,
      }),
    onSuccess: (r) => {
      toast(
        disabled
          ? `Access enabled · ${user.name}`
          : `Access disabled · ${user.name}.${unsupervisedNote(d, r.unsupervised)}`,
      );
      setConfirming(false);
      refresh();
    },
  });

  if (!isSupervisor)
    return (
      <div className="rounded-2xl border bg-card p-4 text-sm">
        <p className="font-semibold">{user.id} · Admin</p>
        <p className="mt-1 text-muted-foreground">Admins can work at all sites. Only the owner can change an admin.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {user.id} · Supervisor
        {disabled && ' · Disabled: this user cannot sign in. History stays.'}
      </p>

      <section aria-labelledby="ua-sites" className="rounded-2xl border bg-card p-4">
        <h2 id="ua-sites" className="mb-1 text-base font-bold">
          Sites
        </h2>
        <p className="mb-3 text-[13px] text-muted-foreground">
          The supervisor can mark attendance only at these sites.
        </p>
        <ErrorBanner message={errorText(saveSites.error)} />
        <SiteChecklist sites={d.locations} value={sites} disabled={saveSites.isPending} onChange={setSites} />
        <Button
          className="mt-3 h-12 w-full"
          disabled={!changed || saveSites.isPending}
          aria-busy={saveSites.isPending || undefined}
          onClick={() => once(() => saveSites.mutateAsync())}
        >
          {saveSites.isPending ? 'Saving…' : 'Save sites'}
        </Button>
      </section>

      <div className="flex flex-col gap-2.5">
        <Button variant="outline" className="h-12 justify-start gap-2 px-4" onClick={() => setPwOpen(true)}>
          <KeyRound className="size-[18px] text-blue" aria-hidden="true" />
          Set a new password
        </Button>
        <Button
          variant="outline"
          className={disabled ? 'h-12 justify-start px-4' : 'h-12 justify-start px-4 text-red-text'}
          onClick={() => {
            toggle.reset();
            setConfirming(true);
          }}
        >
          {disabled ? 'Enable access' : 'Disable access'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={disabled ? 'Enable access?' : 'Disable access?'}
        description={
          disabled
            ? `${user.name} can sign in again, at the same sites.`
            : `${user.name} cannot sign in, and is signed out on each device. History stays.`
        }
        okLabel={disabled ? 'Enable' : 'Disable'}
        danger={!disabled}
        pending={toggle.isPending}
        error={errorText(toggle.error)}
        onConfirm={() => toggle.mutate()}
      />
      <PasswordSheet open={pwOpen} user={user} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function PasswordSheet({ open, user, onClose }: { open: boolean; user: User; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[430px] rounded-t-3xl">
        {open && <PasswordForm user={user} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function PasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const once = useSingleSubmit();
  const save = useMutation({
    mutationFn: () =>
      api(`/api/settings/access/${encodeURIComponent(user.id)}/password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      toast(`Password changed · ${user.name} must sign in again`);
      onClose();
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    once(() => save.mutateAsync());
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 px-5 pb-6">
      <SheetHeader className="px-0 pt-5 pb-0">
        <SheetTitle className="text-lg font-bold text-text">New password · {user.name}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {user.name} is signed out on each device and must use the new password. Tell them the password yourself.
        </SheetDescription>
      </SheetHeader>
      <ErrorBanner message={errorText(save.error)} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="np-pw">New password</Label>
        <PasswordInput
          id="np-pw"
          required
          minLength={8}
          maxLength={100}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          disabled={save.isPending}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 rounded-xl border-line bg-field px-3.5 text-base"
        />
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-12" disabled={save.isPending} aria-busy={save.isPending || undefined}>
          {save.isPending ? 'Saving…' : 'Set password'}
        </Button>
      </div>
    </form>
  );
}
