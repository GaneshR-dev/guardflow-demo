import { CalendarCheck, FileChartColumn, House, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';

// 4 tabs. Guards and Sites open from Settings, so the Settings tab is active there too.
const ITEMS = [
  { to: '/home', label: 'Home', Icon: House, also: [] as string[] },
  { to: '/attendance', label: 'Attendance', Icon: CalendarCheck, also: [] },
  { to: '/reports', label: 'Reports', Icon: FileChartColumn, also: [] },
  { to: '/settings', label: 'Settings', Icon: Settings, also: ['/employees', '/locations'] },
];

const under = (path: string, base: string) => path === base || path.startsWith(base + '/');

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-1/2 z-10 grid h-[72px] w-full max-w-[430px] -translate-x-1/2 grid-cols-4 border-t bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {ITEMS.map(({ to, label, Icon, also }) => {
        const active = [to, ...also].some((base) => under(pathname, base));
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-col items-center justify-center gap-[5px] text-xs whitespace-nowrap text-[#5f6f86]',
              active && 'font-semibold text-navy [&_svg]:text-blue',
            )}
          >
            <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
