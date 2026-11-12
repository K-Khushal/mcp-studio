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
import { StdioArgsPanel, StdioEnvPanel, stdioArgCount, stdioEnvCount } from "@/components/connection/stdio-form";
import { useStore } from "@/store";

type WorkspaceTab = 'args' | 'env' | 'auth' | 'headers' | 'tools' | 'prompts';
const SETUP_TABS: Record<'stdio' | 'http', WorkspaceTab[]> = { stdio: ['args', 'env'], http: ['auth', 'headers'] };

function TabCount({ count }: { count: number | undefined }) {
  if (count === undefined) return null;
  return (
    <span aria-hidden className="ml-1.5 min-w-4 rounded-full bg-muted px-1.5 text-center text-xs tabular-nums text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-foreground">
      {count}
    </span>
  );
}

export function StudioView() {
  const transport = useStore((s) => s.transport);
  const selectedConnectionId = useStore((s) => s.selectedConnectionId);
  const live = useStore((s) => s.connectionStatus === 'connected' && s.connectedConnectionId !== null && s.connectedConnectionId === s.selectedConnectionId);
  const toolCount = useStore((s) => s.tools.length);
  const promptCount = useStore((s) => s.prompts.length);
  const argCount = useStore((s) => stdioArgCount(s.stdio.args));
  const envCount = useStore((s) => stdioEnvCount(s.stdio.env));
  const headerCount = useStore((s) => Object.keys(s.httpHeaders).filter((key) => key.trim()).length);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(transport === 'stdio' && !live ? 'args' : 'tools');

  // Setup tabs belong to one transport; switching transport moves to the other's matching tab
  useEffect(() => {
    const other = SETUP_TABS[transport === 'stdio' ? 'http' : 'stdio'];
    const index = other.indexOf(workspaceTab);
    if (index !== -1) setWorkspaceTab(SETUP_TABS[transport][index]!);
  }, [transport, workspaceTab]);

  // Open a disconnected STDIO Connection on its setup; land on Tools once a Session starts
  useEffect(() => {
    setWorkspaceTab(live || useStore.getState().transport !== 'stdio' ? 'tools' : 'args');
  }, [selectedConnectionId, live]);

  const tabs: { value: WorkspaceTab; label: string; count?: number | undefined }[] = transport === 'stdio'
    ? [{ value: 'args', label: 'Arguments', count: argCount }, { value: 'env', label: 'Process env', count: envCount }]
    : [{ value: 'auth', label: 'Auth' }, { value: 'headers', label: 'Headers', count: headerCount }];
  const callTabs: typeof tabs = [
    { value: 'tools', label: 'Tools', count: live ? toolCount : undefined },
    { value: 'prompts', label: 'Prompts', count: live ? promptCount : undefined },
  ];
  const trigger = (tab: (typeof tabs)[number]) => (
    <TabsTrigger key={tab.value} value={tab.value} className="group flex items-center">
      {tab.label}
      <TabCount count={tab.count} />
    </TabsTrigger>
  );

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
      {/* Radix keeps the roving tab stop on the last focused tab; remount when the app switches tabs itself */}
      <TabsList key={`${selectedConnectionId}:${live}:${transport}`} aria-label="Workspace">
        {tabs.map(trigger)}
        <div aria-hidden className="mx-1.5 h-3.5 w-px self-center bg-border" />
        {callTabs.map(trigger)}
      </TabsList>

      {/* Resizable Call/response split */}
      <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={60} minSize={15}>
          <div className="h-full overflow-y-auto">
            <TabsContent className="h-full" value="args"><StdioArgsPanel /></TabsContent>
            <TabsContent className="h-full" value="env"><StdioEnvPanel /></TabsContent>
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
