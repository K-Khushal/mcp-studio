/**
 * StudioView — main workspace.
 * Layout: [ConnectionPanel | ToolExplorer] | [ResponseViewer]
 *          with LogsPanel collapsible at the bottom.
 *
 * TODO (Phase 2): wire in react-resizable-panels for drag-to-resize.
 */
export function StudioView() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden divide-x divide-border">
        {/* Left column: connection + tool list */}
        <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
          <Placeholder label="ConnectionPanel" />
          <Placeholder label="ToolExplorer" className="flex-1" />
        </div>

        {/* Center: response viewer */}
        <div className="flex-1 overflow-hidden">
          <Placeholder label="ResponseViewer" className="h-full" />
        </div>
      </div>

      {/* Logs panel */}
      <div className="border-t border-border">
        <Placeholder label="LogsPanel" />
      </div>
    </div>
  );
}

function Placeholder({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center bg-panel text-xs text-muted-foreground ${className}`}
      style={{ minHeight: 80 }}
    >
      {label}
    </div>
  );
}
