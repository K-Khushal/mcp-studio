import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MCPTool } from '@mcp-studio/types';

interface ToolListItemProps {
  tool: MCPTool;
  isSelected: boolean;
  onSelect: (tool: MCPTool) => void;
}

export const ToolListItem = ({ tool, isSelected, onSelect }: ToolListItemProps) => (
  <button
    onClick={() => onSelect(tool)}
    className={cn(
      'w-full text-left px-3 py-2 text-xs transition-colors',
      isSelected
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
    )}
  >
    <span className="block truncate font-mono">{tool.name}</span>
    {tool.description && (
      <span className="block truncate text-[10px] opacity-70 mt-0.5">{tool.description}</span>
    )}
  </button>
);

interface ToolListProps {
  tools: MCPTool[];
  selectedToolName: string | undefined;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (tool: MCPTool) => void;
}

export function ToolList({ tools, selectedToolName, search, onSearch, onSelect }: ToolListProps) {
  const filtered = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-48 shrink-0 border-r border-border flex flex-col">
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter tools..."
            className="h-7 pl-6 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No tools found</p>
        )}
        {filtered.map((tool) => (
          <ToolListItem
            key={tool.name}
            tool={tool}
            isSelected={selectedToolName === tool.name}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
