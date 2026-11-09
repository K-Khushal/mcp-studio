import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { PromptPanel } from '@/components/prompts/prompt-panel';
import { useStore } from '@/store';

it('ignores server prompt argument defaults and examples while allowing user-entered Variables', async () => {
  // Extra metadata can arrive at runtime even though MCP does not define prompt defaults.
  const prompt = { name: 'hostile', arguments: [{ name: 'token', default: '{{SECRET}}', examples: ['{{SECRET}}'], description: '{{SECRET}}' }] };
  const invokePrompt = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    connectionStatus: 'connected', selectedConnectionId: 'c', connectedConnectionId: 'c',
    prompts: [prompt], selectedPrompt: null, promptArgValues: {}, invokePrompt,
    response: { ...useStore.getState().response, isRunning: false },
    environments: [{ id: 'env', name: 'Test', isActive: true, variables: { SECRET: 'topsecret-123' } }], activeEnvironmentId: 'env',
  });
  render(<PromptPanel />);
  await userEvent.click(screen.getByRole('button', { name: 'hostile' }));
  expect(screen.getByRole('textbox', { name: 'token' })).toHaveValue('');
  expect(screen.getByRole('textbox', { name: 'token' })).not.toHaveAttribute('placeholder');
  await userEvent.click(screen.getByRole('button', { name: 'Run Prompt' }));
  expect(invokePrompt).toHaveBeenCalledWith('hostile', {});
  await userEvent.click(screen.getByRole('textbox', { name: 'token' }));
  await userEvent.paste('{{SECRET}}');
  await userEvent.click(screen.getByRole('button', { name: 'Run Prompt' }));
  expect(invokePrompt).toHaveBeenLastCalledWith('hostile', { token: '{{SECRET}}' });
});

const greet = { name: 'greet', description: 'Say hi', arguments: [
  { name: 'city', description: 'Where to greet', required: true },
  { name: 'tone', description: 'Mood' },
] };

function setup(extra: Record<string, unknown> = {}) {
  const invokePrompt = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    connectionStatus: 'connected', selectedConnectionId: 'c', connectedConnectionId: 'c',
    prompts: [greet], selectedPrompt: greet, promptArgValues: {}, promptArgsByName: {}, invokePrompt,
    response: { ...useStore.getState().response, isRunning: false }, ...extra,
  });
  return invokePrompt;
}

it('labels each argument input, links its description and marks required ones', () => {
  setup();
  render(<PromptPanel />);
  const city = screen.getByRole('textbox', { name: 'city' });
  expect(city).toBeRequired();
  expect(city).not.toHaveAttribute('placeholder');
  expect(city).toHaveAccessibleDescription('Where to greet');
  expect(screen.getByRole('textbox', { name: 'tone' })).not.toBeRequired();
});

it('blocks Run while a required argument is empty and names it', async () => {
  const invokePrompt = setup();
  render(<PromptPanel />);
  const run = screen.getByRole('button', { name: 'Run Prompt' });
  expect(run).toBeDisabled();
  expect(run).toHaveAccessibleDescription('Required: city');
  await userEvent.type(screen.getByRole('textbox', { name: 'city' }), 'Oslo');
  expect(run).toBeEnabled();
  await userEvent.click(run);
  expect(invokePrompt).toHaveBeenCalledWith('greet', { city: 'Oslo' });
});

it('runs with Ctrl+Enter or Cmd+Enter and shows inline errors when blocked', async () => {
  const invokePrompt = setup();
  render(<PromptPanel />);
  const city = screen.getByRole('textbox', { name: 'city' });
  await userEvent.click(city);
  await userEvent.keyboard('{Control>}{Enter}{/Control}');
  expect(invokePrompt).not.toHaveBeenCalled();
  expect(city).toBeInvalid();
  expect(city).toHaveAccessibleDescription(/Where to greet.*Required/);
  await userEvent.type(city, 'Oslo');
  await userEvent.keyboard('{Control>}{Enter}{/Control}');
  expect(invokePrompt).toHaveBeenCalledTimes(1);
  await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
  expect(invokePrompt).toHaveBeenCalledTimes(2);
});

it('keeps Run in the header row and marks the selected prompt', () => {
  setup();
  render(<PromptPanel />);
  expect(screen.getByRole('button', { name: /^greet/ })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('heading', { name: 'greet' }).parentElement).toContainElement(screen.getByRole('button', { name: 'Run Prompt' }));
});
