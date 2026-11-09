import { ConnectionPanel } from "@/components/connection/connection-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { PromptPanel } from "@/components/prompts/prompt-panel";
import ToolPannel from "@/components/tools/tool-panel";
import { ResponsePanel } from "@/components/response/response-panel";
import { AuthPanel } from "@/components/auth/auth-panel";
import { HeadersPanel } from "@/components/auth/headers-panel";
import { useStore } from "@/store";

type WorkspaceTab = 'auth' | 'headers' | 'tools' | 'prompts';

export function StudioView() {
  const transport = useStore((s) => s.transport);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('tools');

  // Reset to tools when switching away from HTTP
  useEffect(() => {
    if (transport !== 'http' && (workspaceTab === 'auth' || workspaceTab === 'headers')) {
      setWorkspaceTab('tools');
    }
  }, [transport, workspaceTab]);

  const tabs: { value: WorkspaceTab; label: string; httpOnly?: boolean }[] = [
    { value: 'auth', label: 'Auth', httpOnly: true },
    { value: 'headers', label: 'Headers', httpOnly: true },
    { value: 'tools', label: 'Tools' },
    { value: 'prompts', label: 'Prompts' },
  ];

  const visibleTabs = tabs.filter((t) => !t.httpOnly || transport === 'http');

  return (
    <Tabs value={workspaceTab} onValueChange={value => setWorkspaceTab(value as WorkspaceTab)} className="flex-1 min-w-0 min-h-0">
      <ErrorBoundary fallback={
        <div className="p-2 text-xs text-destructive-text bg-destructive/10 rounded-md m-2">
          Connection panel failed to load.
        </div>
      }>
        <ConnectionPanel />
      </ErrorBoundary>

      {/* Tabs */}
      <TabsList aria-label="Workspace">
        {visibleTabs.map(tab => <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
      </TabsList>

      {/* Resizable Call/response split */}
      <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={60} minSize={15}>
          <div className="h-full overflow-y-auto">
            <TabsContent className="h-full" value="auth"><AuthPanel /></TabsContent>
            <TabsContent className="h-full" value="headers"><HeadersPanel /></TabsContent>
            <TabsContent className="h-full" value="prompts"><PromptPanel /></TabsContent>
            <TabsContent className="h-full" value="tools"><ToolPannel /></TabsContent>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={40} minSize={40}>
          <ResponsePanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </Tabs>
  );
}
