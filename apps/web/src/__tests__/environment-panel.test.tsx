import { beforeEach, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import EnvironmentPanel from '@/components/environments/environment-panel';
import { useStore } from '@/store';

beforeEach(() => useStore.setState({
  environments: [{ id: 'env', name: 'Test', isActive: true, variables: { CRED: 'synthetic-secret', HOST: 'localhost' } }],
  activeEnvironmentId: 'env',
}));

it('masks all existing and new values, reveals deliberately, and remasks on reopen', async () => {
  render(<EnvironmentPanel />);
  await userEvent.click(screen.getByRole('button', { name: 'Environment' }));
  expect(screen.getByDisplayValue('synthetic-secret')).toHaveAttribute('type', 'password');
  expect(screen.getByDisplayValue('localhost')).toHaveAttribute('type', 'password');
  expect(screen.getByPlaceholderText('VALUE')).toHaveAttribute('type', 'password');
  expect(screen.getByPlaceholderText('VALUE')).toHaveAttribute('autocomplete', 'off');
  expect(screen.getByDisplayValue('synthetic-secret')).toHaveAttribute('autocomplete', 'off');
  await userEvent.click(screen.getByRole('button', { name: 'Reveal CRED' }));
  expect(screen.getByDisplayValue('synthetic-secret')).toHaveAttribute('type', 'text');
  expect(screen.getByRole('button', { name: 'Reveal CRED' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Reveal CRED' }));
  expect(screen.getByDisplayValue('synthetic-secret')).toHaveAttribute('type', 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Reveal CRED' }));
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Environment' }));
  expect(screen.getByDisplayValue('synthetic-secret')).toHaveAttribute('type', 'password');
});
