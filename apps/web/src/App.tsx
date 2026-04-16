import { useEffect } from "react";
import { TopNav } from "@/components/shell/TopNav";
import { IconSidebar } from "@/components/shell/IconSidebar";
import { StatusBar } from "@/components/shell/StatusBar";
import { useStore } from "@/store";

// Lazy-load views (each is a separate chunk)
import { StudioView } from "@/views/StudioView";
import { CollectionsView } from "@/views/CollectionsView";
import { HistoryView } from "@/views/HistoryView";
import { LogsView } from "@/views/LogsView";
import { SettingsView } from "@/views/SettingsView";

export function App() {
  const { activeView, loadHistory, loadCollections, loadEnvironments } = useStore();

  useEffect(() => {
    // Hydrate persistent data on mount
    Promise.all([loadHistory(), loadCollections(), loadEnvironments()]).catch(
      console.error
    );
  }, [loadCollections, loadEnvironments, loadHistory]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <IconSidebar />
        <main className="flex-1 overflow-hidden">
          {activeView === "studio" && <StudioView />}
          {activeView === "collections" && <CollectionsView />}
          {activeView === "history" && <HistoryView />}
          {activeView === "logs" && <LogsView />}
          {activeView === "settings" && <SettingsView />}
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
