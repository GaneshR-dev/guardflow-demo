import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { ScreenError } from './ScreenError';

const show = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ScreenError', () => {
  test('403 at a site: no "Try again", a way to choose another site', async () => {
    const choose = vi.fn();
    show(<ScreenError error={new ApiError('x', 403)} atLocation onRetry={vi.fn()} onChooseLocation={choose} />);
    expect(screen.getByRole('heading', { name: 'No access to this site' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose site' }));
    expect(choose).toHaveBeenCalled();
  });

  test('404 on a page: "Not found" with a way home', () => {
    show(<ScreenError error={new ApiError('x', 404)} onRetry={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  test('no network: alert with "Try again" and the last load time', async () => {
    const retry = vi.fn();
    show(
      <ScreenError
        error={new ApiError('Cannot reach', 0, true)}
        what="the report"
        onRetry={retry}
        loadedAt="10:42 am"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the report');
    expect(screen.getByText('Last loaded at 10:42 am')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  test('500 hides the server text', () => {
    show(<ScreenError error={new ApiError('Traceback: KeyError', 500)} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The server had a problem');
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
  });

  test('422 with a reset action shows the server message', () => {
    show(
      <ScreenError
        error={new ApiError('Day is in the future', 422)}
        what="this report"
        onReset={{ label: 'Go to today', action: vi.fn() }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Day is in the future');
    expect(screen.getByRole('button', { name: 'Go to today' })).toBeInTheDocument();
  });

  test('401 shows nothing: the app already shows the sign-in screen', () => {
    const { container } = show(<ScreenError error={new ApiError('x', 401)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
