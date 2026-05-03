import { ConnectionPanel } from "@/components/connection/connection-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { PromptPanel } from "@/components/prompts/prompt-panel";
import ToolPannel from "@/components/tools/tool-panel";
import { ResponsePanel } from "@/components/response/response-panel";
import { AuthPanel } from "@/components/auth/auth-panel";
import { HeadersPanel } from "@/components/auth/headers-panel";
import { useStore } from "@/store";

type WorkspaceTab = 'auth' | 'headers' | 'prompts' | 'tools';

export function StudioView() {
  const transport = useStore((s) => s.transport);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('prompts');

  // Reset to prompts when switching away from HTTP
  useEffect(() => {
    if (transport !== 'http' && (workspaceTab === 'auth' || workspaceTab === 'headers')) {
      setWorkspaceTab('prompts');
    }
  }, [transport, workspaceTab]);

  const tabs: { value: WorkspaceTab; label: string; httpOnly?: boolean }[] = [
    { value: 'auth', label: 'Auth', httpOnly: true },
    { value: 'headers', label: 'Headers', httpOnly: true },
    { value: 'prompts', label: 'Prompts' },
    { value: 'tools', label: 'Tools' },
  ];

  const visibleTabs = tabs.filter((t) => !t.httpOnly || transport === 'http');

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
        {visibleTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setWorkspaceTab(tab.value)}
            className={cn(
              'px-4 py-2 text-xs font-medium transition-colors capitalize border-b-2',
              workspaceTab === tab.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Resizable request/response split */}
      <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={45} minSize={15}>
          <div className="h-full overflow-y-auto">
            {workspaceTab === 'auth' && <AuthPanel />}
            {workspaceTab === 'headers' && <HeadersPanel />}
            {workspaceTab === 'prompts' && <PromptPanel />}
            {workspaceTab === 'tools' && <ToolPannel />}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55} minSize={40}>
          <ResponsePanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
