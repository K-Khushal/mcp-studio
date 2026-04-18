import { useEffect } from "react";
import { useStore } from "@/store";
import { StatusBar } from "@/components/shell/status-bar";
import { TopNav } from "@/components/shell/top-nav";
import { CollectionsView } from "./collections-view";
import { ConnectionPanel } from "@/components/connection/connection-pannel";
import { ErrorBoundary } from "@/components/error-boundary";

/**
 * StudioView — main workspace.
 * Layout: [ConnectionPanel | ToolExplorer] | [ResponseViewer]
 *          with LogsPanel collapsible at the bottom.
 *
 * TODO (Phase 2): wire in react-resizable-panels for drag-to-resize.
 */

export function StudioView() {

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <ErrorBoundary fallback={
        <div className="p-2 text-xs text-destructive bg-destructive/10 rounded-md m-2">
          Connection panel failed to load.
        </div>
      }>
        <ConnectionPanel />
      </ErrorBoundary>
    </div>
  );
}
