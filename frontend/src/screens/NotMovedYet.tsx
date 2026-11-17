import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { Page } from '@/layout/AppShell';

interface Props {
  title: string;
  // The screen name in the old app, for example "dashboard" for /app#dashboard.
  oldScreen: string;
  noNav?: boolean;
  children?: ReactNode;
}

// A screen that is still in the old app. Each Phase 2 pull request replaces one of these.
export function NotMovedYet({ title, oldScreen, noNav, children }: Props) {
  return (
    <Page title={title} noNav={noNav}>
      <EmptyState
        icon={<ExternalLink />}
        title="This screen is not here yet"
        text="We move the screens to the new app one at a time. Use the current app for this screen."
      >
        <Button asChild className="h-12 px-[22px]">
          <a href={`/app#${oldScreen}`}>Open in the current app</a>
        </Button>
        {children}
      </EmptyState>
    </Page>
  );
}
