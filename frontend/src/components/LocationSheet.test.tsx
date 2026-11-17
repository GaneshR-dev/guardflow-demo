import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { Location } from '@/types/api';
import { LocationSheet } from './LocationSheet';

const LOCS: Location[] = [
  { id: 'loc-a', name: 'Chennai - Anna Nagar', area: 'North', assigned_count: 2, active: 1 },
  { id: 'loc-b', name: 'Chennai - Adyar', area: 'South', assigned_count: 1, active: 0 },
];

describe('LocationSheet', () => {
  test('lists "All sites" and each site, and marks the current one', async () => {
    const pick = vi.fn();
    render(<LocationSheet open onOpenChange={vi.fn()} locations={LOCS} current="loc-a" withAll onPick={pick} />);
    const options = screen.getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual([
      'All sites2 sites',
      'Anna NagarChennai · North · 2 guards',
      'AdyarChennai · South · 1 guard · Disabled',
    ]);
    expect(options[1]).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(options[0]);
    expect(pick).toHaveBeenCalledWith('');
  });
});
