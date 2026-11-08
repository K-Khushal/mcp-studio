import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import EnvironmentPanel from '../environments/environment-panel';
import { ConfigurationPanel } from '../configuration/configuration-panel';
import { Loader2, Plug, Unplug } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ConnectionConfig, HttpAuth } from '@mcp-studio/types';

// Omit auth when it's "none" so stored JSON stays clean and comparison is stable
function normalizeAuth(auth: HttpAuth): HttpAuth | undefined {
  return auth.type === 'none' ? undefined : auth;
}

export function ConnectionPanel() {
  const {
    connectionStatus,
    connect,
    disconnect,
    renameConnection,
    updateConnectionConfig,
    connectedConnectionId,
    connectingConnectionId,
    transport,
    connectionUrl,
    httpAuth,
    httpHeaders,
    setTransport,
    setConnectionUrl,
    selectedConnectionId,
    collections,
  } = useStore();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  // Enter and the blur that follows it both commit; only the first may PATCH
  const isCommittingRename = useRef(false);

  const isConnected = connectionStatus === 'connected';
  const isSelectedConnectionConnected =
    selectedConnectionId !== null && selectedConnectionId === connectedConnectionId && isConnected;
  const isConnecting = connectionStatus === 'connecting';
  const isSelectedConnectionConnecting =
    selectedConnectionId !== null && selectedConnectionId === connectingConnectionId && isConnecting;

  const selectedConnection = selectedConnectionId
    ? collections.flatMap((c) => c.connections).find((r) => r.id === selectedConnectionId)
    : null;
  const selectedCollection = selectedConnectionId
    ? collections.find((collection) => collection.connections.some((connection) => connection.id === selectedConnectionId))
    : null;

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(selectedConnection?.name ?? '');
    }
  }, [selectedConnection?.id, selectedConnection?.name, isRenaming]);

  useEffect(() => {
    if (isRenaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (!selectedConnection || !selectedCollection) return;
    if (!connectionUrl.trim() && !selectedConnection.connectionConfig) return;

    const connectionConfig: ConnectionConfig =
      transport === 'http'
        ? { transport: 'http', config: { url: connectionUrl, headers: httpHeaders, auth: normalizeAuth(httpAuth) } }
        : {
            transport: 'stdio',
            config: {
              command: connectionUrl.trim().split(/\s+/)[0] ?? '',
              args: connectionUrl.trim().split(/\s+/).slice(1),
              env: {},
              inheritSystemEnv: true,
            },
          };

    const currentConfig = selectedConnection.connectionConfig;
    if (JSON.stringify(currentConfig ?? null) === JSON.stringify(connectionConfig)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateConnectionConfig(selectedCollection.id, selectedConnection.id, connectionConfig).catch(console.error);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    selectedCollection?.id,
    selectedConnection?.id,
    selectedConnection?.connectionConfig,
    connectionUrl,
    transport,
    httpAuth,
    httpHeaders,
    updateConnectionConfig,
  ]);

  const commitRename = async () => {
    if (isCommittingRename.current) return;
    if (!selectedConnection || !selectedCollection) {
      setIsRenaming(false);
      return;
    }

    isCommittingRename.current = true;
    try {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== selectedConnection.name) {
        await renameConnection(selectedCollection.id, selectedConnection.id, trimmed);
      } else {
        setRenameValue(selectedConnection.name);
      }
      setIsRenaming(false);
    } finally {
      isCommittingRename.current = false;
    }
  };

  const handleConnect = () => {
    if (isSelectedConnectionConnected) {
      disconnect();
      return;
    }
    const parts = connectionUrl.trim().split(/\s+/);
    const config: ConnectionConfig =
      transport === 'http'
        ? { transport: 'http', config: { url: connectionUrl, headers: httpHeaders, auth: normalizeAuth(httpAuth) } }
        : {
            transport: 'stdio',
            config: { command: parts[0] ?? '', args: parts.slice(1), env: {}, inheritSystemEnv: true },
          };
    connect(config);
  };

  return (
    <div className="border-b border-border bg-card">
      {/* Header row: Connection name, status, env, config */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border">
        {isRenaming && selectedConnection ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename();
              if (e.key === 'Escape') {
                setRenameValue(selectedConnection.name);
                setIsRenaming(false);
              }
            }}
            className="h-6 max-w-[160px] rounded-md border border-input bg-background px-2 text-xs font-semibold font-mono text-foreground outline-hidden focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span
            onDoubleClick={() => selectedConnection && setIsRenaming(true)}
            className="text-xs font-semibold text-foreground font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[160px] cursor-text"
          >
            {selectedConnection?.name ?? 'untitled'}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <div className={cn(
            'w-2 h-2 rounded-full',
            isSelectedConnectionConnected
              ? 'bg-success'
              : isSelectedConnectionConnecting
                ? 'bg-warning animate-pulse'
                : 'bg-destructive'
          )} />
          <span className="text-xs text-muted-foreground">
            {isSelectedConnectionConnected ? 'Connected' : isSelectedConnectionConnecting ? 'Connecting...' : 'Disconnected'}
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
          onKeyDown={(e) => e.key === 'Enter' && !isSelectedConnectionConnected && !isSelectedConnectionConnecting && handleConnect()}
          placeholder={transport === 'stdio' ? 'npx @test/test-mcp' : 'http://localhost:4000'}
          className="flex-1"
        />

        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
            isSelectedConnectionConnected
              ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
            isConnecting && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSelectedConnectionConnecting ? <Loader2 size={14} className="animate-spin" /> : isSelectedConnectionConnected ? <Unplug size={14} /> : <Plug size={14} />}
          {isSelectedConnectionConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
