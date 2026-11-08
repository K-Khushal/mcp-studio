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
