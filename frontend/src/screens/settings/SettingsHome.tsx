import { History, KeyRound, MapPin, UserRound, Users } from 'lucide-react';
import { useState } from 'react';
import { uiRole, useSession } from '@/auth/session';
import { signOut } from '@/auth/signOut';
import { LoadingRows } from '@/components/LoadingRows';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Page } from '@/layout/AppShell';
import { plural } from '@/lib/format';
import { useEmployees, useSettings } from './data';
import { SettingsRow } from './SettingsRow';

export function SettingsHome() {
  const session = useSession();
  const admin = uiRole(session) === 'admin';
  const settings = useSettings();
  const employees = useEmployees();
  const [signingOut, setSigningOut] = useState(false);
  const d = settings.data;
  // The Guards count shows "–" when only that request fails. The screen still works.
  const guards = employees.data ? employees.data.filter((e) => e.active).length : '–';

  let body;
  if (settings.isPending) body = <LoadingRows label="Loading settings…" rows={4} />;
  else if (!d) body = <ScreenError error={settings.error} what="the settings" onRetry={() => settings.refetch()} />;
  else
    body = (
      <>
        <h2 className="mb-2.5 text-base font-bold">Manage</h2>
        <ul className="flex flex-col gap-2.5">
          <SettingsRow to="/employees" Icon={Users} title="Guards" count={guards} />
          <SettingsRow to="/locations" Icon={MapPin} title="Sites" count={d.locations.length} />
        </ul>
        <h2 className="mt-6 mb-2.5 text-base font-bold">Account</h2>
        <ul className="flex flex-col gap-2.5">
          <SettingsRow
            to="/settings/profile"
            Icon={UserRound}
            title="My profile"
            detail={`${d.profile.name} · ${d.profile.id}`}
          />
          <SettingsRow
            to="/settings/access"
            Icon={KeyRound}
            title="User access"
            detail={admin ? 'Supervisors and their sites' : 'Your role and your sites'}
            count={admin ? plural(d.access.length, 'user') : undefined}
          />
          {admin && (
            <SettingsRow
              to="/settings/activity"
              Icon={History}
              title="Activity log"
              detail="Each change, with the reason"
            />
          )}
        </ul>
      </>
    );

  return (
    <Page title="Settings">
      {body}
      <Button
        variant="outline"
        className="mt-8 h-12 w-full"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          await signOut();
        }}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </Page>
  );
}
