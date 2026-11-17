import { useMutation } from '@tanstack/react-query';
import { Download, History } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingRows } from '@/components/LoadingRows';
import { ScreenError } from '@/components/ScreenError';
import { Button } from '@/components/ui/button';
import { Page } from '@/layout/AppShell';
import { apiFile, friendlyError, isApiError } from '@/lib/api';
import { fmtShortDay, fmtTime, istDay } from '@/lib/format';
import { toast } from '@/lib/toast';
import { auditDetail, auditTitle, useAudit } from './data';

const FILE = 'guardian-activity-log.csv';

// Admin only: each recorded change, newest first. The server returns 403 for other roles.
export function Activity() {
  const audit = useAudit();
  const download = useMutation({
    mutationFn: () => apiFile('/api/audit/export', FILE),
    onSuccess: () => toast(`Activity log is ready · ${FILE}`),
  });

  let body;
  if (audit.isPending) body = <LoadingRows label="Loading the activity log…" rows={5} />;
  else if (!audit.data)
    body = <ScreenError error={audit.error} what="the activity log" onRetry={() => audit.refetch()} />;
  else if (!audit.data.length)
    body = (
      <EmptyState icon={<History />} title="No activity yet" text="Changes show here with who made them and when." />
    );
  else
    body = (
      <>
        <p className="mb-3 text-[13px] text-muted-foreground">Newest first. A time correction always has a reason.</p>
        <ul className="flex flex-col gap-2.5">
          {audit.data.map((a, i) => (
            <li key={a.at + i} className="rounded-2xl border bg-card px-4 py-3">
              <strong className="block text-[15px]">{auditTitle(a)}</strong>
              {auditDetail(a) && <span className="block text-[13px] text-text break-words">{auditDetail(a)}</span>}
              <small className="block text-xs text-muted-foreground">
                {a.user_id} · {fmtShortDay(istDay(a.at))}, {fmtTime(a.at)}
              </small>
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <Page
      title="Activity log"
      back={{ to: '/settings', label: 'Settings' }}
      action={
        audit.data && audit.data.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-blue"
            aria-label="Export the activity log (CSV)"
            disabled={download.isPending}
            aria-busy={download.isPending || undefined}
            onClick={() => download.mutate()}
          >
            <Download className="size-[22px]" aria-hidden="true" />
          </Button>
        ) : undefined
      }
    >
      {download.error && (
        <ErrorBanner
          message={`Could not export the log. ${friendlyError(isApiError(download.error) ? download.error.status : 0, download.error.message)}`}
        />
      )}
      {body}
    </Page>
  );
}
