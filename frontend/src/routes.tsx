import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { uiRole, useSession } from '@/auth/session';
import { AppShell } from '@/layout/AppShell';
import { Home } from '@/screens/Home';
import { Login } from '@/screens/Login';
import { NotMovedYet } from '@/screens/NotMovedYet';
import { Settings } from '@/screens/Settings';

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
            <Route path="/attendance" element={<NotMovedYet title="Mark attendance" oldScreen="attendance" />} />
            <Route path="/attendance/add" element={<NotMovedYet title="Guard check-in" oldScreen="add" />} />
            <Route
              path="/attendance/checkout"
              element={<NotMovedYet title="Manage check-outs" oldScreen="checkout" />}
            />
            <Route path="/employees" element={<NotMovedYet title="Guards" oldScreen="employees" />} />
            <Route path="/locations" element={<NotMovedYet title="Sites" oldScreen="locations" />} />
            <Route path="/locations/:id" element={<NotMovedYet title="Site" oldScreen="locations" />} />
            <Route path="/reports" element={<NotMovedYet title="Reports" oldScreen="reports" />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
