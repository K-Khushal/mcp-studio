import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import EnvironmentPanel from '../environments/environment-panel';
import { Loader2, Plug, Unplug } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { buildConnectionConfig, isConnectable } from '@/store/connection-form';
import { StdioForm } from './stdio-form';

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
    stdio,
    httpAuth,
    httpHeaders,
    setTransport,
    setConnectionUrl,
    setStdio,
    selectedConnectionId,
    collections,
  } = useStore();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  // Enter and the blur that follows it both commit; only the first may PATCH
  const isCommittingRename = useRef(false);
  // Debounced autosave not yet sent; flushed on switch and Connect so edits are never dropped
  const pendingSave = useRef<{ timeoutId: number; save: () => void; connectionId: string } | null>(null);

  const flushPendingSave = () => {
    const pending = pendingSave.current;
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingSave.current = null;
    pending.save();
  };

  // Unmount: send the pending edit only if its Connection still exists
  useEffect(() => () => flushPendingSave(), []);

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
    if (pendingSave.current && pendingSave.current.connectionId !== selectedConnection?.id) flushPendingSave();
    if (!selectedConnection || !selectedCollection) return;
    const connectionConfig = buildConnectionConfig({ transport, stdio, connectionUrl, httpHeaders, httpAuth });
    if (!isConnectable(connectionConfig) && !selectedConnection.connectionConfig) return;

    const currentConfig = selectedConnection.connectionConfig;
    if (JSON.stringify(currentConfig ?? null) === JSON.stringify(connectionConfig)) {
      return;
    }

    if (pendingSave.current) window.clearTimeout(pendingSave.current.timeoutId);
    const save = () => {
      pendingSave.current = null;
      const exists = useStore.getState().collections.some((c) => c.connections.some((r) => r.id === selectedConnection.id));
      if (!exists) return;
      updateConnectionConfig(selectedCollection.id, selectedConnection.id, connectionConfig).catch(console.error);
    };
    pendingSave.current = {
      timeoutId: window.setTimeout(save, 250),
      save,
      connectionId: selectedConnection.id,
    };
  }, [
    selectedCollection?.id,
    selectedConnection?.id,
    selectedConnection?.connectionConfig,
    connectionUrl,
    stdio,
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

  const canConnect = isConnectable(buildConnectionConfig({ transport, stdio, connectionUrl, httpHeaders, httpAuth }));

  const handleConnect = () => {
    if (isSelectedConnectionConnected) {
      disconnect();
      return;
    }
    flushPendingSave();
    const config = buildConnectionConfig({ transport, stdio, connectionUrl, httpHeaders, httpAuth });
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
          value={transport === 'stdio' ? stdio.command : connectionUrl}
          onChange={(e) => (transport === 'stdio' ? setStdio({ command: e.target.value }) : setConnectionUrl(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && canConnect && !isSelectedConnectionConnected && !isSelectedConnectionConnecting && handleConnect()}
          aria-label={transport === 'stdio' ? 'Command' : 'Server URL'}
          placeholder={transport === 'stdio' ? 'npx' : 'http://localhost:4000'}
          className="flex-1 font-mono"
        />

        <button
          onClick={handleConnect}
          disabled={isConnecting || (!canConnect && !isSelectedConnectionConnected)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
            isSelectedConnectionConnected
              ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
            (isConnecting || (!canConnect && !isSelectedConnectionConnected)) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSelectedConnectionConnecting ? <Loader2 size={14} className="animate-spin" /> : isSelectedConnectionConnected ? <Unplug size={14} /> : <Plug size={14} />}
          {isSelectedConnectionConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {transport === 'stdio' && <StdioForm />}
    </div>
  );
}
