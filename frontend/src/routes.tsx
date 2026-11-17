import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { AppShell } from '@/layout/AppShell';
import { Attendance } from '@/screens/Attendance';
import { Home } from '@/screens/Home';
import { Login } from '@/screens/Login';
import { Reports } from '@/screens/Reports';
import { SiteDetail } from '@/screens/reports/SiteDetail';
import { Guards } from '@/screens/Guards';
import { NotMovedYet } from '@/screens/NotMovedYet';
import { Access } from '@/screens/settings/Access';
import { AccessUser } from '@/screens/settings/AccessUser';
import { Activity } from '@/screens/settings/Activity';
import { Profile } from '@/screens/settings/Profile';
import { SettingsHome } from '@/screens/settings/SettingsHome';

// No session: go to the sign-in screen.
function RequireSession() {
  const session = useSession();
  return session.token ? <Outlet /> : <Navigate to="/login" replace />;
}

// The owner sees only the owner console until they pick a company.
function RequireCompany({ children }: { children?: ReactNode }) {
  const session = useSession();
  if (uiRole(session) === 'owner') return <Navigate to="/owner" replace />;
  return children ?? <Outlet />;
}

// The paths match the screens of the old app (#dashboard → /home, #add → /attendance/add, …).
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireSession />}>
        <Route path="/owner" element={<NotMovedYet title="Your companies" oldScreen="dashboard" noNav />} />
        <Route element={<RequireCompany />}>
          <Route element={<AppShell />}>
            <Route path="/home" element={<Home />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/attendance/add" element={<Navigate to="/attendance?status=not_in" replace />} />
            <Route path="/attendance/checkout" element={<Navigate to="/attendance?status=checked_in" replace />} />
            <Route path="/employees" element={<Guards />} />
            <Route path="/locations" element={<NotMovedYet title="Sites" oldScreen="locations" />} />
            <Route path="/locations/:id" element={<NotMovedYet title="Site" oldScreen="locations" />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/sites/:id" element={<SiteDetail />} />
            <Route path="/settings" element={<SettingsHome />} />
            <Route path="/settings/profile" element={<Profile />} />
            <Route path="/settings/access" element={<Access />} />
            <Route path="/settings/access/:id" element={<AccessUser />} />
            <Route path="/settings/activity" element={<Activity />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
