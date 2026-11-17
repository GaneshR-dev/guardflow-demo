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
  children: ReactNode;
}

export function Page({ title, noNav, children }: PageProps) {
  return (
    <main className={cn('mx-auto min-h-svh w-full max-w-[430px] p-[22px] max-[379px]:p-4', !noNav && 'pb-[120px]')}>
      <Header />
      {title && <h1 className="mb-4 text-[27px] leading-tight font-bold text-text">{title}</h1>}
      {children}
    </main>
  );
}
