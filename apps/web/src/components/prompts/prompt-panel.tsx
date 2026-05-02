import { useCallback } from 'react';
import { Play, ChevronRight, Search } from 'lucide-react';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    className={cn(
      'w-full text-left px-3 py-2 text-xs transition-colors',
      isSelected
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
    )}
  >
    <span className="block truncate font-mono">{prompt.name}</span>
    {prompt.description && (
      <span className="block truncate text-[10px] opacity-70 mt-0.5">{prompt.description}</span>
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
    <div className="w-48 shrink-0 border-r border-border flex flex-col">
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
    selectedRequestId,
    connectedRequestId,
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
  const handleArgChange = useCallback((name: string, value: string) => {
    setPromptArgValues({ ...promptArgValues, [name]: value });
  }, [promptArgValues, setPromptArgValues]);

  const handleRun = useCallback(() => {
    if (!selectedPrompt) return;
    invokePrompt(selectedPrompt.name, promptArgValues).catch(console.error);
  }, [selectedPrompt, promptArgValues, invokePrompt]);

  const isSelectedRequestConnected =
    connectionStatus === 'connected' && selectedRequestId === connectedRequestId;

  if (!isSelectedRequestConnected) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Connect to this request to load prompts
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
              <h3 className="text-sm font-semibold text-foreground">{selectedPrompt.name}</h3>
              {selectedPrompt.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{selectedPrompt.description}</p>
              )}
            </div>

            {selectedPrompt.arguments && selectedPrompt.arguments.length > 0 && (
              <div className="flex flex-col gap-3">
                {selectedPrompt.arguments.map((arg) => (
                  <div key={arg.name} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-foreground">
                      {arg.name}
                      {arg.required && <span className="text-destructive ml-0.5">*</span>}
                      {arg.description && (
                        <span className="text-muted-foreground font-normal ml-1">— {arg.description}</span>
                      )}
                    </label>
                    <Input
                      value={promptArgValues[arg.name] ?? ''}
                      onChange={(e) => handleArgChange(arg.name, e.target.value)}
                      placeholder={arg.description ?? arg.name}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border mt-auto">
              <Button
                size="sm"
                onClick={handleRun}
                disabled={response.isStreaming}
                className="gap-1.5 text-xs"
              >
                <Play size={12} />
                {response.isStreaming ? 'Running…' : 'Run Prompt'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
