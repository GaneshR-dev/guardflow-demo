import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { updateUser } from '@/auth/session';
import { LoadingRows } from '@/components/LoadingRows';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Page } from '@/layout/AppShell';
import { api, friendlyError, isApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { SettingsAnswer } from '@/types/api';
import { useSettings } from './data';
import { useSingleSubmit } from '@/lib/useSingleSubmit';

const ROLE: Record<string, string> = { admin: 'Admin', supervisor: 'Supervisor', owner: 'Owner' };

export function Profile() {
  const settings = useSettings();
  const d = settings.data;
  let body;
  if (settings.isPending) body = <LoadingRows label="Loading your profile…" rows={2} />;
  else if (!d) body = <ScreenError error={settings.error} what="your profile" onRetry={() => settings.refetch()} />;
  else body = <ProfileForm key={d.profile.name} profile={d.profile} />;
  return (
    <Page title="My profile" back={{ to: '/settings', label: 'Settings' }}>
      {body}
    </Page>
  );
}

function ProfileForm({ profile }: { profile: SettingsAnswer['profile'] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile.name);
  // The last saved name. After a save, the form is not changed any more, so a second tap sends nothing.
  const [saved, setSaved] = useState(profile.name);
  const once = useSingleSubmit();
  const save = useMutation({
    mutationFn: () =>
      api<{ name: string }>('/api/settings/profile', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }),
    onSuccess: (r) => {
      setSaved(r.name);
      updateUser({ name: r.name });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast('Profile saved');
    },
  });
  const changed = name.trim() !== saved && name.trim().length > 0;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (changed) once(() => save.mutateAsync());
  };
  const error = save.error && friendlyError(isApiError(save.error) ? save.error.status : 0, save.error.message);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pf-name">Name</Label>
        <Input
          id="pf-name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          value={name}
          disabled={save.isPending}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'pf-error' : undefined}
          className="h-12 rounded-xl border-line bg-field px-3.5 text-base"
        />
        {error && (
          <p id="pf-error" role="alert" className="text-[13px] font-semibold text-red-text">
            {error}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">User ID</dt>
          <dd className="font-semibold">{profile.id}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-semibold">{ROLE[profile.role] || profile.role}</dd>
        </div>
      </dl>
      <Button
        type="submit"
        className="h-12"
        disabled={!changed || save.isPending}
        aria-busy={save.isPending || undefined}
      >
        {save.isPending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
