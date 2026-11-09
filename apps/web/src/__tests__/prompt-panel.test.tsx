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
  expect(screen.getByPlaceholderText('token')).toHaveValue('');
  expect(screen.queryByPlaceholderText('{{SECRET}}')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Run Prompt' }));
  expect(invokePrompt).toHaveBeenCalledWith('hostile', {});
  await userEvent.click(screen.getByPlaceholderText('token'));
  await userEvent.paste('{{SECRET}}');
  await userEvent.click(screen.getByRole('button', { name: 'Run Prompt' }));
  expect(invokePrompt).toHaveBeenLastCalledWith('hostile', { token: '{{SECRET}}' });
});
