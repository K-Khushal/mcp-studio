import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { HeadersPanel } from '@/components/auth/headers-panel';
import { useStore } from '@/store';
afterEach(cleanup);
beforeEach(() => useStore.setState({ selectedConnectionId: 'headers-test', connectionDrafts: {}, httpHeaders: { 'X-Trace': 'trace', Other: 'other' } }));
it('keeps focus while editing a header name and preserves colliding rows', async () => {
 render(<HeadersPanel />);
 const name=screen.getByRole('textbox', { name: 'Header 1 name' });
 await userEvent.clear(name);
 await userEvent.type(name, 'Other');
 expect(name).toHaveFocus();
 expect(screen.getAllByRole('textbox')).toHaveLength(4);
 expect(screen.getByRole('alert')).toHaveTextContent('unique');
 await userEvent.clear(name);
 await userEvent.type(name, 'X-Request');
 expect(useStore.getState().httpHeaders).toEqual({ 'X-Request': 'trace', Other: 'other' });
});
it('retains unfinished rows after leaving Headers and returning', async () => {
 const view=render(<HeadersPanel />);
 await userEvent.click(screen.getByRole('button', { name: 'Add header' }));
 await userEvent.type(screen.getByLabelText('Header 3 value'), 'draft');
 view.unmount();
 render(<HeadersPanel />);
 expect(screen.getByLabelText('Header 3 name')).toHaveValue('');
 expect(screen.getByLabelText('Header 3 value')).toHaveValue('draft');
});
