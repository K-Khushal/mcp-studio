import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import EnvironmentPanel from '../environments/environment-panel';
import { ConfigurationPanel } from '../configuration/configuration-panel';
import { Loader2, Plug, Unplug } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ConnectionConfig } from '@mcp-studio/types';

export function ConnectionPanel() {
  const {
    connectionStatus,
    connect,
    disconnect,
    renameRequest,
    transport,
    connectionUrl,
    setTransport,
    setConnectionUrl,
    selectedRequestId,
    collections,
  } = useStore();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const selectedRequest = selectedRequestId
    ? collections.flatMap((c) => c.requests).find((r) => r.id === selectedRequestId)
    : null;
  const selectedCollection = selectedRequestId
    ? collections.find((collection) => collection.requests.some((request) => request.id === selectedRequestId))
    : null;

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(selectedRequest?.name ?? '');
    }
  }, [selectedRequest?.id, selectedRequest?.name, isRenaming]);

  useEffect(() => {
    if (isRenaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [isRenaming]);

  const commitRename = async () => {
    if (!selectedRequest || !selectedCollection) {
      setIsRenaming(false);
      return;
    }

    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== selectedRequest.name) {
      await renameRequest(selectedCollection.id, selectedRequest.id, trimmed);
    } else {
      setRenameValue(selectedRequest.name);
    }
    setIsRenaming(false);
  };

  const handleConnect = () => {
    if (isConnected) {
      disconnect();
      return;
    }
    let config: ConnectionConfig;
    if (transport === 'http') {
      config = { transport: 'http', config: { url: connectionUrl, headers: {} } };
    } else {
      const parts = connectionUrl.trim().split(/\s+/);
      config = {
        transport: 'stdio',
        config: { command: parts[0] ?? '', args: parts.slice(1), env: {}, inheritSystemEnv: true },
      };
    }
    connect(config);
  };

  return (
    <div className="border-b border-border bg-card">
      {/* Header row: request name, status, env, config */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border">
        {isRenaming && selectedRequest ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename();
              if (e.key === 'Escape') {
                setRenameValue(selectedRequest.name);
                setIsRenaming(false);
              }
            }}
            className="h-6 max-w-[160px] rounded-md border border-input bg-background px-2 text-xs font-semibold font-mono text-foreground outline-hidden focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span
            onDoubleClick={() => selectedRequest && setIsRenaming(true)}
            className="text-xs font-semibold text-foreground font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[160px] cursor-text"
          >
            {selectedRequest?.name ?? 'untitled'}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <div className={cn(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-success' : isConnecting ? 'bg-warning animate-pulse' : 'bg-destructive'
          )} />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        <div className="flex-1" />
        <EnvironmentPanel />
        <ConfigurationPanel />
      </div>

      {/* Connection controls */}
      <div className="flex items-center gap-3 p-3">
        <div className="flex rounded-md overflow-hidden border border-border text-xs">
          <button
            onClick={() => setTransport('stdio')}
            className={cn(
              'px-3 py-1.5 font-medium transition-colors',
              transport === 'stdio' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            STDIO
          </button>
          <button
            onClick={() => setTransport('http')}
            className={cn(
              'px-3 py-1.5 font-medium transition-colors',
              transport === 'http' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            HTTP
          </button>
        </div>

        <Input
          value={connectionUrl}
          onChange={(e) => setConnectionUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isConnected && handleConnect()}
          placeholder={transport === 'stdio' ? 'npx @test/test-mcp' : 'http://localhost:4000'}
          className="flex-1"
        />

        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
            isConnected
              ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
            isConnecting && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isConnecting ? <Loader2 size={14} className="animate-spin" /> : isConnected ? <Unplug size={14} /> : <Plug size={14} />}
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
