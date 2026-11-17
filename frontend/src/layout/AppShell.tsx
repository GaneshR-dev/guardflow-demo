import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { cn } from '@/lib/utils';
import { BottomNav } from './BottomNav';
import { Header } from './Header';

// Screen container: header, page content and the bottom navigation.
export function AppShell() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

interface PageProps {
  title?: string;
  // No bottom navigation on this screen (sign-in, owner console).
  noNav?: boolean;
  // A small action at the right of the title, for example an icon button.
  action?: ReactNode;
  // The context row under the title, for example the site button and the date.
  context?: ReactNode;
  children: ReactNode;
}

// Each page has the same sections, each with a fixed height, so each section starts at the same
// position on every page (see "Page sections" in docs/UI-GUIDE.md):
// brand bar · title row (44 px, action on the right) · context row (44 px) · content.
// Do not add a top margin to the first block of a screen.
export function Page({ title, noNav, action, context, children }: PageProps) {
  return (
    <main
      className={cn(
        'mx-auto min-h-svh w-full max-w-[430px] bg-app p-[22px] shadow-[0_0_0_1px_#d9e1ec,0_18px_60px_rgba(0,0,0,0.1)] max-[379px]:p-4',
        !noNav && 'pb-[120px]',
      )}
    >
      <Header />
      {title && (
        <div data-section="title" className="mb-2 flex h-11 items-center justify-between gap-3">
          <h1 className="text-[27px] leading-tight font-bold text-text">{title}</h1>
          {action}
        </div>
      )}
      {context && (
        <div data-section="context" className="mb-4 flex min-h-11 items-center justify-between gap-3">
          {context}
        </div>
      )}
      <div data-section="content">{children}</div>
    </main>
  );
}
