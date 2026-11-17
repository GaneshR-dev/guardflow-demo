import { CalendarCheck, FileChartColumn, House, MapPin, Settings, Users } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/home', label: 'Home', Icon: House },
  { to: '/attendance', label: 'Attendance', Icon: CalendarCheck },
  { to: '/employees', label: 'Guards', Icon: Users },
  { to: '/locations', label: 'Sites', Icon: MapPin },
  { to: '/reports', label: 'Reports', Icon: FileChartColumn },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

// Bottom navigation. A sub-screen (for example /attendance/add) keeps its tab active.
export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-1/2 z-10 grid h-[72px] w-full max-w-[430px] -translate-x-1/2 grid-cols-6 border-t bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 flex-col items-center justify-center gap-[5px] text-[11px] tracking-[-0.2px] whitespace-nowrap text-[#5f6f86]',
              isActive && 'font-semibold text-navy [&_svg]:text-blue',
            )
          }
        >
          <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
