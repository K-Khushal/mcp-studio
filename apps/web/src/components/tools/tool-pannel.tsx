import { useStore } from '@/store';

export default function ToolPannel() {
  const { connectionStatus } = useStore();

  if (connectionStatus !== 'connected') {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Connect to an MCP server to discover tools
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      TO BE IMPLEMENTED
    </div>
  )
}
