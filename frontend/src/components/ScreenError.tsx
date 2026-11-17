import { CalendarX2, MapPin, RotateCw, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { friendlyError, isApiError } from '@/lib/api';
import { EmptyState } from './EmptyState';

interface Props {
  error: unknown;
  // The view belongs to one location (attendance, a report). 403 and 404 then talk about the location.
  atLocation?: boolean;
  // What could not load, for example "the report". Default: "this page".
  what?: string;
  onRetry?: () => void;
  onChooseLocation?: () => void;
  // 400 or 422 on a view: the filters are not valid. Give a way back, for example "Go to today".
  onReset?: { label: string; action: () => void };
  // The time of the last good load, for example "10:42 am".
  loadedAt?: string;
}

// The shared error state for a view that could not load its data. It shows the correct state
// for 403, 404, bad input, no network and server errors. A 401 shows nothing: api() already
// ended the session and the app shows the sign-in screen.
export function ScreenError({
  error,
  atLocation,
  what = 'this page',
  onRetry,
  onChooseLocation,
  onReset,
  loadedAt,
}: Props) {
  const status = isApiError(error) ? error.status : 0;
  const message = error instanceof Error ? error.message : 'Request failed';
  if (status === 401) return null;

  const choose = onChooseLocation && (
    <Button variant="outline" className="h-12 px-[22px]" onClick={onChooseLocation}>
      Choose site
    </Button>
  );
  const home = (
    <Button asChild variant="outline" className="h-12 px-[22px]">
      <Link to="/home">Go to Home</Link>
    </Button>
  );

  if (status === 403)
    return atLocation ? (
      <EmptyState
        icon={<MapPin />}
        title="No access to this site"
        text="Ask an admin for access, or choose another site."
      >
        {choose}
      </EmptyState>
    ) : (
      <EmptyState
        icon={<MapPin />}
        title="No access"
        text="Your account cannot open this page. Ask an admin for access."
      >
        {home}
      </EmptyState>
    );

  if (status === 404)
    return atLocation ? (
      <EmptyState icon={<MapPin />} title="Site not found" text="This site no longer exists. Choose another site.">
        {choose}
      </EmptyState>
    ) : (
      <EmptyState icon={<MapPin />} title="Not found" text="This item no longer exists.">
        {home}
      </EmptyState>
    );

  if ((status === 400 || status === 422) && onReset)
    return (
      <EmptyState icon={<CalendarX2 />} title={`Could not show ${what}`} text={message} tone="error">
        <Button className="h-12 px-[22px]" onClick={onReset.action}>
          {onReset.label}
        </Button>
      </EmptyState>
    );

  return (
    <EmptyState
      icon={<WifiOff />}
      title={`Could not load ${what}`}
      text={friendlyError(status, message) + (onRetry ? ' Your filters stay the same.' : '')}
      tone="error"
    >
      {onRetry && (
        <Button className="h-12 px-[22px]" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      )}
      {loadedAt && <small className="text-xs text-muted-foreground">Last loaded at {loadedAt}</small>}
    </EmptyState>
  );
}
