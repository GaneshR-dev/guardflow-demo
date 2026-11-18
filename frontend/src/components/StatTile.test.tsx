import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  test('without onClick it only shows the number and the label', () => {
    render(<StatTile value={16} label="Checked in" tone="green" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('16')).toHaveClass('text-green-text');
  });

  test('with onClick it is a filter button with aria-pressed', async () => {
    const click = vi.fn();
    render(<StatTile value={5} label="Not checked in" tone="amber" pressed onClick={click} />);
    const button = screen.getByRole('button', { name: '5 Not checked in' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(click).toHaveBeenCalled();
  });
});
