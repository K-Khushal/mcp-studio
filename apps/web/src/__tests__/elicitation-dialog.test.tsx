import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ElicitationFormDialog } from '../components/tools/elicitation-dialog';

it('requires the requested name before accepting and sends the form values', async () => {
  const respond = vi.fn();
  render(<ElicitationFormDialog request={{ type: 'elicitation_request', elicitationId: 'one', message: 'Your name?', requestedSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }} onRespond={respond} />);
  expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
  await userEvent.type(screen.getByRole('textbox', { name: /name/i }), 'Ada');
  await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(respond).toHaveBeenCalledWith({ action: 'accept', content: { name: 'Ada' } });
});

it('keeps server Variable defaults as hints instead of accepting them as form values', async () => {
  const respond = vi.fn();
  render(<ElicitationFormDialog request={{ type: 'elicitation_request', elicitationId: 'unsafe', message: 'Optional token?', requestedSchema: { type: 'object', properties: { token: { type: 'string', default: '{{SECRET}}' }, nested: { type: 'object', default: { auth: '{{SECRET}}' } }, safe: { type: 'string', default: 'hello' } } } }} onRespond={respond} />);
  expect(screen.getByRole('textbox', { name: 'token' })).toHaveValue('');
  expect(screen.getAllByText(/Server default \(not applied\)/)).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(respond).toHaveBeenCalledWith({ action: 'accept', content: { safe: 'hello' } });
});
