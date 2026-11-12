import { ToolIcon, ToolBadges, toolTitle } from './tool-metadata';
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
    aria-current={isSelected ? 'true' : undefined}
    className={cn(
      'w-full text-left px-3 py-2 text-xs transition-colors border-l-2',
      isSelected
        ? 'border-l-primary bg-primary/15 text-foreground font-medium'
        : 'border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
    )}
  >
    <span className="flex items-center gap-2"><ToolIcon tool={tool} /><span className="truncate">{toolTitle(tool)}</span></span>
    <ToolBadges tool={tool} compact />
    {tool.description && (
      <span className="mt-0.5 block truncate pl-6 text-xs text-muted-foreground">{tool.description}</span>
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
      toolTitle(t).toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex max-h-44 w-full shrink-0 flex-col border-b border-border md:max-h-none md:w-56 md:border-r md:border-b-0">
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
