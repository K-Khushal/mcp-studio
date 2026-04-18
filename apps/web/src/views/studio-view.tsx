import { ConnectionPanel } from "@/components/connection/connection-pannel";
import { ErrorBoundary } from "@/components/error-boundary";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { PromptPanel } from "@/components/prompts/prompt-pannel";
import ToolPannel from "@/components/tools/tool-pannel";

/**
 * StudioView — main workspace.
 * Layout: [ConnectionPanel | ToolExplorer] | [ResponseViewer]
 *          with LogsPanel collapsible at the bottom.
 *
 * TODO: wire in react-resizable-panels for drag-to-resize.
 */

export function StudioView() {
  const [workspaceTab, setWorkspaceTab] = useState<'prompts' | 'tools'>('prompts');

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <ErrorBoundary fallback={
        <div className="p-2 text-xs text-destructive bg-destructive/10 rounded-md m-2">
          Connection panel failed to load.
        </div>
      }>
        <ConnectionPanel />
      </ErrorBoundary>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['prompts', 'tools'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setWorkspaceTab(tab)}
            className={cn(
              'px-4 py-2 text-xs font-medium transition-colors capitalize border-b-2',
              workspaceTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Resizable request/response split */}
      <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={45} minSize={15}>
          <div className="h-full overflow-y-auto">
            {workspaceTab === 'prompts' ? <PromptPanel /> : <ToolPannel />}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
      </ResizablePanelGroup>
    </div>
  );
}
