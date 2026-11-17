import { useMutation } from '@tanstack/react-query';
import { Clock, MapPin, Pencil, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Page } from '@/layout/AppShell';
import { api } from '@/lib/api';
import { fmtShift, locCity, locationShifts, plural, shortLoc } from '@/lib/format';
import { endsNextDay } from '@/lib/shift';
import { toast } from '@/lib/toast';
import { SettingsRow } from '../settings/SettingsRow';
import { errorText, useRefreshSites, useSites } from './data';
import { ShiftSheet } from './ShiftSheet';
import { SiteSheet } from './SiteSheet';

// One site: its shifts, a link to its guards, and "Mark attendance here". Admins edit the name,
// the area and the shifts, and disable or enable the site. The site comes from the sites list,
// so the screen does not load it again.
export function SiteScreen() {
  const { id = '' } = useParams();
  const admin = uiRole(useSession()) === 'admin';
  const sites = useSites();
  const refresh = useRefreshSites();
  const [editing, setEditing] = useState(false);
  const [editingShifts, setEditingShifts] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const site = sites.data?.find((l) => l.id === id);

  const toggle = useMutation({
    mutationFn: () =>
      site!.active
        ? api(`/api/settings/locations/${encodeURIComponent(id)}`, { method: 'DELETE' })
        : api(`/api/settings/locations/${encodeURIComponent(id)}/enable`, { method: 'POST' }),
    onSuccess: () => {
      toast(`${site!.active ? 'Site disabled' : 'Site enabled'} · ${shortLoc(site!.name)}`);
      setConfirming(false);
      refresh();
    },
  });

  const back = { to: '/locations', label: 'Sites' };
  if (sites.isPending)
    return (
      <Page title="Site" back={back}>
        <LoadingRows label="Loading the site…" rows={3} />
      </Page>
    );
  if (!sites.data)
    return (
      <Page title="Site" back={back}>
        <ScreenError error={sites.error} what="the site" onRetry={() => sites.refetch()} />
      </Page>
    );
  if (!site)
    return (
      <Page title="Site" back={back}>
        <EmptyState
          icon={<MapPin />}
          title="Site not found"
          text="The site does not exist, or you have no access to it."
        >
          <Button asChild variant="outline" className="h-12 px-[22px]">
            <Link to="/locations">Back to sites</Link>
          </Button>
        </EmptyState>
      </Page>
    );

  const off = !site.active;
  const shifts = locationShifts(site);
  const place = [locCity(site.name), site.area].filter(Boolean).join(' · ');
  const disabledGuards = Number(site.disabled_count || 0);

  return (
    <Page
      title={shortLoc(site.name)}
      back={back}
      action={
        admin ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-blue"
            aria-label="Edit site"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-5" aria-hidden="true" />
          </Button>
        ) : undefined
      }
      context={
        <p className="text-sm text-muted-foreground">
          {place}
          {off && (
            <span className="ml-1.5 rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Disabled
            </span>
          )}
        </p>
      }
    >
      {toggle.error && !confirming && <ErrorBanner message={`Could not change the site. ${errorText(toggle.error)}`} />}
      {sites.error && <ErrorBanner message={`Could not refresh. ${errorText(sites.error)}`} />}

      <section aria-labelledby="shifts-title" className="rounded-2xl border bg-card p-4">
        <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
          <h2 id="shifts-title" className="flex items-center gap-2 text-base font-bold">
            <Clock className="size-[18px] text-blue" aria-hidden="true" />
            Shifts
          </h2>
          {admin && (
            <Button variant="link" className="h-11 px-0 text-blue" onClick={() => setEditingShifts(true)}>
              {shifts.length ? 'Edit shifts' : 'Add shifts'}
            </Button>
          )}
        </div>
        {shifts.length ? (
          <ul className="flex flex-col gap-1.5">
            {shifts.map((s) => (
              <li key={`${s.shift_start}-${s.shift_end}`} className="text-[15px]">
                <span className="font-semibold">
                  {fmtShift(s.shift_start)} – {fmtShift(s.shift_end)}
                </span>{' '}
                <span className="text-muted-foreground">
                  IST{endsNextDay(s.shift_start, s.shift_end) ? ' · Ends the next day' : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No shift set.{admin ? '' : ' An admin can add the shifts.'}</p>
        )}
      </section>

      <ul className="mt-3">
        <SettingsRow
          to={`/employees?site=${encodeURIComponent(site.id)}`}
          Icon={Users}
          title="Guards"
          detail={disabledGuards ? plural(disabledGuards, 'disabled guard') : undefined}
          count={site.assigned_count}
        />
      </ul>

      {off ? (
        <p className="mt-4 text-sm text-muted-foreground">Enable this site to mark attendance here again.</p>
      ) : (
        <Button asChild className="mt-4 h-12 w-full">
          <Link to={`/attendance?location=${encodeURIComponent(site.id)}`}>Mark attendance here</Link>
        </Button>
      )}

      {admin &&
        (off ? (
          <Button
            className="mt-3 h-12 w-full"
            disabled={toggle.isPending}
            aria-busy={toggle.isPending || undefined}
            onClick={() => toggle.mutate()}
          >
            {toggle.isPending ? 'Enabling…' : 'Enable site'}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="mt-6 h-12 w-full text-red-text"
            onClick={() => {
              toggle.reset();
              setConfirming(true);
            }}
          >
            Disable site
          </Button>
        ))}

      {!admin && <p className="mt-4 text-[13px] text-muted-foreground">Only admins can change sites.</p>}

      {admin && (
        <>
          <SiteSheet open={editing} site={site} onClose={() => setEditing(false)} onSaved={refresh} />
          <ShiftSheet open={editingShifts} site={site} onClose={() => setEditingShifts(false)} onSaved={refresh} />
          <ConfirmDialog
            open={confirming}
            onOpenChange={(o) => !toggle.isPending && setConfirming(o)}
            title={`Disable ${shortLoc(site.name)}?`}
            lines={[{ label: 'Site', value: site.id }]}
            description="It stays in the list, greyed out. Supervisors keep seeing it. History is kept."
            okLabel="Disable site"
            danger
            pending={toggle.isPending}
            error={confirming && toggle.error ? errorText(toggle.error) : null}
            onConfirm={() => toggle.mutate()}
          />
        </>
      )}
    </Page>
  );
}
