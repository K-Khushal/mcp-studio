import { afterEach, beforeEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useStore } from '@/store';
import { VariableInput } from '@/components/shared/variable-input';

afterEach(cleanup);
beforeEach(() => useStore.setState({ activeEnvironmentId: 'dev', environments: [
  { id: 'dev', name: 'Dev', isActive: true, variables: { HOST: 'localhost', EMPTY: '' } },
] }));

it('highlights exact Variable references and flags missing names in the active Environment', () => {
  const { container } = render(<VariableInput aria-label="Command" value="{{HOST}} {{MISSING}} {{EMPTY}} {{ spaced }} {{bad-name}}" onChange={() => {}} />);
  expect([...container.querySelectorAll('mark')].map((el) => el.textContent)).toEqual(['{{HOST}}', '{{MISSING}}', '{{EMPTY}}']);
  expect(screen.getByRole('textbox').getAttribute('title')).toContain('HOST: localhost');
  expect(screen.getByRole('textbox').getAttribute('title')).toContain('MISSING: Unresolved Variable');
  expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  act(() => useStore.setState({ activeEnvironmentId: null }));
  expect(screen.getByRole('textbox').getAttribute('title')).toContain('HOST: Unresolved Variable');
});

it('masks sensitive previews while still showing ordinary resolved values', () => {
  useStore.setState({ environments: [{ id: 'dev', name: 'Dev', isActive: true, variables: { API_KEY: 'do-not-show', accessToken: 'also-private', HOST: 'localhost' } }] });
  render(<VariableInput aria-label="Auth" value="{{API_KEY}} {{accessToken}} {{HOST}}" onChange={() => {}} />);
  const preview = screen.getByRole('textbox').getAttribute('title')!;
  expect(preview).toContain('API_KEY: •••••••• (masked)');
  expect(preview).toContain('accessToken: •••••••• (masked)');
  expect(preview).toContain('HOST: localhost');
  expect(document.body.textContent).not.toContain('do-not-show');
  expect(preview).not.toContain('also-private');
});

it.each([false, true])('preserves native typing, selection, paste and composition (multiline=%s)', async (multiline) => {
  const { useState } = await import('react');
  const { default: userEvent } = await import('@testing-library/user-event');
  const { VariableTextarea } = await import('@/components/shared/variable-input');
  const { fireEvent } = await import('@testing-library/react');
  function Editor() {
    const [value, setValue] = useState('a {{HOST}} z');
    return multiline ? <VariableTextarea aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} /> :
      <VariableInput aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} />;
  }
  render(<Editor />);
  const user = userEvent.setup();
  const input = screen.getByRole('textbox') as HTMLInputElement;
  await user.click(input);
  input.setSelectionRange(2, 10);
  await user.keyboard('X');
  expect(input.value).toBe('a X z');
  expect(input.selectionStart).toBe(3);
  await user.paste('{{HOST}}');
  expect(input.value).toBe('a X{{HOST}} z');
  expect(input.selectionStart).toBe(11);
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'a X{{HOST}} 日本 z' } });
  fireEvent.compositionEnd(input, { data: '日本' });
  expect(input.value).toBe('a X{{HOST}} 日本 z');
  expect(screen.getByRole('textbox')).toBe(input);
  input.setSelectionRange(0, 3);
  act(() => useStore.setState({ activeEnvironmentId: null }));
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(3);
});

it('updates highlights for uncontrolled native input consumers too', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  const { container } = render(<VariableInput aria-label="Value" defaultValue="" />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'http://');
  await user.paste('{{HOST}}');
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('http://{{HOST}}');
  expect(container.querySelector('mark')?.textContent).toBe('{{HOST}}');
});

it('highlights JSON argument values without treating object keys as interpolated Variables', async () => {
  const { JsonTextarea } = await import('@/components/tools/json-textarea');
  const { container } = render(<JsonTextarea label="Arguments JSON" value={{ '{{KEY}}': '{{HOST}}', nested: ['{{MISSING}}'] }} onChange={() => {}} />);
  expect([...container.querySelectorAll('mark')].map(el => el.textContent)).toEqual(['{{HOST}}', '{{MISSING}}']);
  expect(screen.getByRole('textbox').getAttribute('title')).not.toContain('KEY:');
});
