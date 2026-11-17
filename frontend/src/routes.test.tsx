import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test } from 'vitest';
import { clearSession, endSession, selectCompany, startSession } from '@/auth/session';
import { AppRoutes } from './routes';

const at = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('routes', () => {
  test('no session goes to sign-in', () => {
    clearSession();
    at('/reports');
    expect(screen.getByRole('heading', { name: 'Guardian' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('a session that the server ended shows why', () => {
    endSession();
    at('/home');
    expect(screen.getByRole('alert')).toHaveTextContent('Your session ended. Sign in again.');
  });

  test('a signed-in admin sees the screen and the bottom navigation', () => {
    startSession('t', { id: 'admin.demo', name: 'Admin', role: 'admin', company_id: 'c1' });
    at('/attendance/add');
    expect(screen.getByRole('heading', { name: 'Employee check-in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in the current app' })).toHaveAttribute('href', '/app#add');
    expect(screen.getByRole('link', { name: 'Attendance' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { name: /Home|Attendance|Employees|Locations|Reports|Settings/ })).toHaveLength(
      6,
    );
  });

  test('the owner without a company sees only the owner console', () => {
    startSession('t', { id: 'owner', name: 'Owner', role: 'owner', company_id: null });
    at('/reports');
    expect(screen.getByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  test('the owner with a company sees the screens and the company name', () => {
    startSession('t', { id: 'owner', name: 'Owner', role: 'owner', company_id: null });
    selectCompany('c1', 'Acme Security');
    at('/reports');
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('Acme Security')).toBeInTheDocument();
  });
});
