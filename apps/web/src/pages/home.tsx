import { ElicitationDialog } from "@/components/tools/elicitation-dialog";
import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { StatusBar } from "@/components/shell/status-bar";
import { TopNav } from "@/components/shell/top-nav";
import { CollectionsView } from "@/views/collections-view";
import { StudioView } from "@/views/studio-view";
import { FolderOpen } from "lucide-react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LogsPanel } from "@/components/logs/logs-panel";
import { FirstRunPanel } from "@/components/collections/first-run-panel";

export default function Home() {
  const { loadCollections, loadEnvironments, selectedConnectionId } = useStore();
  const hasCollections = useStore((s) => s.collections.length > 0);
  const hasConnections = useStore((s) => s.collections.some((c) => c.connections.length > 0));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([loadCollections(), loadEnvironments()]).catch(console.error).finally(() => setLoaded(true));
  }, [loadCollections, loadEnvironments]);

  return (
    <SidebarProvider className="h-screen min-h-0 w-screen flex-col overflow-hidden bg-background">
      <TopNav />
      <ElicitationDialog />
      <div className="flex min-h-0 flex-1">
        <CollectionsView />
        <SidebarInset className="min-w-0 min-h-0 rounded-none shadow-none">
          {selectedConnectionId ? (
            <>
              <StudioView />
              <LogsPanel />
            </>
          ) : loaded && !hasCollections ? (
            <FirstRunPanel />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
              <FolderOpen size={32} strokeWidth={1.5} aria-hidden />
              <p className="text-sm">
                {hasConnections ? "Select a Connection to get started" : "Add a Connection to a Collection to get started"}
              </p>
            </div>
          )}
          <StatusBar />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
