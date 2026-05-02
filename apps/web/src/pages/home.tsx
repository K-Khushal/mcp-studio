import { useEffect } from "react";
import { useStore } from "@/store";
import { StatusBar } from "@/components/shell/status-bar";
import { TopNav } from "@/components/shell/top-nav";
import { CollectionsView } from "@/views/collections-view";
import { StudioView } from "@/views/studio-view";
import { FolderOpen } from "lucide-react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LogsPanel } from "@/components/logs/logs-panel";

export default function Home() {
  const { loadCollections, loadEnvironments, selectedRequestId } = useStore();

  useEffect(() => {
    Promise.all([loadCollections(), loadEnvironments()]).catch(console.error);
  }, [loadCollections, loadEnvironments]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TopNav />
      <SidebarProvider className="flex-1 min-h-0">
        <CollectionsView />
        <SidebarInset className="min-w-0 min-h-0 rounded-none shadow-none">
          {selectedRequestId ? (
            <>
              <StudioView />
              <LogsPanel />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <FolderOpen size={32} strokeWidth={1.5} />
              <p className="text-sm">Select a request to get started</p>
            </div>
          )}
          <StatusBar />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
