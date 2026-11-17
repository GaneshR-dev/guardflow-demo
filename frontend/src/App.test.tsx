import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

test('links to the current app', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: 'Open the current app' })).toHaveAttribute('href', '/app');
});
