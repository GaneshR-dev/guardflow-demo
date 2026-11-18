import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  test('shows the lines and confirms', async () => {
    const ok = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Confirm check-in"
        lines={[{ label: 'Employee', value: 'Ravi Kumar' }]}
        okLabel="Check in"
        onConfirm={ok}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: 'Confirm check-in' })).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(ok).toHaveBeenCalledTimes(1);
  });

  test('while pending, both buttons are disabled and the error shows', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Disable"
        pending
        error="Already disabled"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Already disabled');
  });

  test('a fast double tap confirms one time only', async () => {
    const ok = vi.fn();
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="Check in" okLabel="Check in" onConfirm={ok} />);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Check in' }));
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
