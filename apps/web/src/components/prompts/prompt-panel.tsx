import { useCallback, useEffect, useId, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useStore } from '@/store';
import { Input } from '@/components/ui/input';
import { VariableInput } from '@/components/shared/variable-input';
import { RequiredNotice, RunButton, isRunShortcut } from '@/components/shared/run-button';
import { cn } from '@/lib/utils';
import type { MCPPrompt } from '@mcp-studio/types';

// ---------------------------------------------------------------------------
// PromptList
// ---------------------------------------------------------------------------

interface PromptListItemProps {
  prompt: MCPPrompt;
  isSelected: boolean;
  onSelect: (prompt: MCPPrompt) => void;
}

const PromptListItem = ({ prompt, isSelected, onSelect }: PromptListItemProps) => (
  <button
    onClick={() => onSelect(prompt)}
    aria-current={isSelected ? 'true' : undefined}
    className={cn(
      'w-full text-left px-3 py-2 text-xs transition-colors border-l-2',
      isSelected
        ? 'border-l-primary bg-primary/15 text-foreground font-medium'
        : 'border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
    )}
  >
    <span className="block truncate font-mono">{prompt.name}</span>
    {prompt.description && (
      <span className="block truncate text-xs text-muted-foreground mt-0.5">{prompt.description}</span>
    )}
  </button>
);

interface PromptListProps {
  prompts: MCPPrompt[];
  selectedPromptName: string | undefined;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (prompt: MCPPrompt) => void;
}

function PromptList({ prompts, selectedPromptName, search, onSearch, onSelect }: PromptListProps) {
  const filtered = prompts.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-56 shrink-0 border-r border-border flex flex-col">
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter prompts..."
            className="h-7 pl-6 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No prompts found</p>
        )}
        {filtered.map((prompt) => (
          <PromptListItem
            key={prompt.name}
            prompt={prompt}
            isSelected={selectedPromptName === prompt.name}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptPanel
// ---------------------------------------------------------------------------

export function PromptPanel() {
  const {
    connectionStatus,
    selectedConnectionId,
    connectedConnectionId,
    prompts,
    selectedPrompt,
    promptSearch,
    promptArgValues,
    response,
    selectPrompt,
    setPromptSearch,
    setPromptArgValues,
    invokePrompt,
  } = useStore();
  const baseId = useId();
  const [attempted, setAttempted] = useState(false);
  const missing = (selectedPrompt?.arguments ?? [])
    .filter((arg) => arg.required && !promptArgValues[arg.name])
    .map((arg) => arg.name);
  useEffect(() => setAttempted(false), [selectedPrompt?.name]);
  const handleArgChange = useCallback((name: string, value: string) => {
    setPromptArgValues({ ...promptArgValues, [name]: value });
  }, [promptArgValues, setPromptArgValues]);

  const handleRun = useCallback(() => {
    if (!selectedPrompt || missing.length > 0) return;
    invokePrompt(selectedPrompt.name, promptArgValues).catch(console.error);
  }, [selectedPrompt, promptArgValues, invokePrompt, missing.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRunShortcut(e) || response.isRunning) return;
    e.preventDefault();
    if (missing.length === 0) return handleRun();
    setAttempted(true);
    const index = selectedPrompt?.arguments?.findIndex((arg) => arg.name === missing[0]) ?? -1;
    document.getElementById(`${baseId}-arg-${index}`)?.focus();
  };

  const isSelectedConnectionConnected =
    connectionStatus === 'connected' && selectedConnectionId === connectedConnectionId;

  if (!isSelectedConnectionConnected) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Connect to load prompts
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No prompts available
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <PromptList
        prompts={prompts}
        selectedPromptName={selectedPrompt?.name}
        search={promptSearch}
        onSearch={setPromptSearch}
        onSelect={selectPrompt}
      />

      <div className="flex-1 flex flex-col min-w-0 p-4 gap-4 overflow-y-auto">
        {!selectedPrompt ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ChevronRight size={12} />
            Select a prompt to get started
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="truncate text-sm font-semibold text-foreground">{selectedPrompt.name}</h3>
                <RunButton label="Run Prompt" running={response.isRunning} disabled={missing.length > 0} describedBy={missing.length > 0 ? `${baseId}-required` : undefined} onClick={handleRun} />
              </div>
              {selectedPrompt.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{selectedPrompt.description}</p>
              )}
              <div className="mt-1"><RequiredNotice id={`${baseId}-required`} missing={missing} /></div>
            </div>

            {selectedPrompt.arguments && selectedPrompt.arguments.length > 0 && (
              <div className="flex flex-col gap-3" onKeyDown={handleKeyDown}>
                {selectedPrompt.arguments.map((arg, index) => {
                  const id = `${baseId}-arg-${index}`;
                  const invalid = attempted && missing.includes(arg.name);
                  const describedBy = [arg.description && `${id}-desc`, invalid && `${id}-error`].filter(Boolean).join(' ') || undefined;
                  return (
                    <div key={arg.name} className="flex flex-col gap-1">
                      <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-foreground">
                        {arg.name}
                        {arg.required && <span aria-hidden="true" className="text-destructive-text">*</span>}
                      </label>
                      {arg.description && <p id={`${id}-desc`} className="text-xs text-muted-foreground">{arg.description}</p>}
                      <VariableInput
                        id={id}
                        value={promptArgValues[arg.name] ?? ''}
                        onChange={(e) => handleArgChange(arg.name, e.target.value)}
                        aria-required={arg.required || undefined}
                        aria-invalid={invalid || undefined}
                        aria-describedby={describedBy}
                        className="h-8 text-xs"
                      />
                      {invalid && <p id={`${id}-error`} className="text-xs text-destructive-text">Required</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
