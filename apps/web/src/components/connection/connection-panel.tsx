import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import EnvironmentPanel from '../environments/environment-panel';
import { OAuthSignInNotice } from '../auth/oauth-sign-in-notice';
import { CircleAlert, Loader2, Plug, Unplug } from 'lucide-react';
import { VariableInput } from '@/components/shared/variable-input';
import { buildConnectionConfig, headersFromRows, isConnectable } from '@/store/connection-form';
import { SegmentedControl } from '@/components/ui/segmented-control';

export function ConnectionPanel() {
  const {
    connectionStatus,
    lastConnectionError,
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
    connectionDrafts,
  } = useStore();
  const headerRows = selectedConnectionId ? connectionDrafts[selectedConnectionId]?.headerRows : undefined;
  const invalidHeaders = transport === 'http' && headerRows !== undefined && headersFromRows(headerRows) === null;
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
    if (!selectedConnection || !selectedCollection || invalidHeaders) {
      if (pendingSave.current) window.clearTimeout(pendingSave.current.timeoutId);
      pendingSave.current = null;
      return;
    }
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
    invalidHeaders,
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

  const canConnect = !invalidHeaders && isConnectable(buildConnectionConfig({ transport, stdio, connectionUrl, httpHeaders, httpAuth }));

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
            aria-label="Connection name"
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
            className="h-6 max-w-[160px] rounded-md border border-input bg-background px-2 text-xs font-semibold font-mono text-foreground outline-hidden focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            aria-label={`Rename Connection ${selectedConnection?.name ?? 'untitled'}`}
            onClick={() => selectedConnection && setIsRenaming(true)}
            onDoubleClick={() => selectedConnection && setIsRenaming(true)}
            className="text-xs font-semibold text-foreground font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[160px] outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            {selectedConnection?.name ?? 'untitled'}
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <div className={cn(
            'w-2 h-2 rounded-full',
            isSelectedConnectionConnected
              ? 'bg-success'
              : isSelectedConnectionConnecting
                ? 'bg-warning motion-safe:animate-pulse'
                : lastConnectionError?.connectionId === selectedConnectionId
                  ? 'bg-destructive'
                  : 'bg-muted-foreground/50'
          )} />
          <span className="text-xs text-muted-foreground">
            {isSelectedConnectionConnected ? 'Connected' : isSelectedConnectionConnecting ? 'Connecting…' : lastConnectionError?.connectionId === selectedConnectionId ? 'Failed' : 'Disconnected'}
          </span>
        </div>
        <div className="flex-1" />
        <EnvironmentPanel />
      </div>

      {/* Connection controls */}
      <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
        <SegmentedControl aria-label="Transport" value={transport} onValueChange={setTransport} options={[{ value: 'stdio', label: 'STDIO' }, { value: 'http', label: 'HTTP' }]} />

        <div className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
        <VariableInput
          value={transport === 'stdio' ? stdio.command : connectionUrl}
          onChange={(e) => (transport === 'stdio' ? setStdio({ command: e.target.value }) : setConnectionUrl(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && canConnect && !isSelectedConnectionConnected && !isSelectedConnectionConnecting && handleConnect()}
          aria-label={transport === 'stdio' ? 'Command' : 'Server URL'}
          placeholder={transport === 'stdio' ? 'npx' : 'http://localhost:4000'}
          className="font-mono"
        />
        </div>

        <button
          onClick={handleConnect}
          disabled={isConnecting || (!canConnect && !isSelectedConnectionConnected)}
          className={cn(
            'ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors sm:ml-0',
            isSelectedConnectionConnected
              ? 'bg-destructive/15 text-destructive-text hover:bg-destructive/25'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
            (isConnecting || (!canConnect && !isSelectedConnectionConnected)) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSelectedConnectionConnecting ? <Loader2 size={14} className="motion-safe:animate-spin" /> : isSelectedConnectionConnected ? <Unplug size={14} /> : <Plug size={14} />}
          {isSelectedConnectionConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
      {lastConnectionError?.connectionId === selectedConnectionId && (
        <p role="alert" className="mx-3 mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-foreground">
          <CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-destructive-text" />
          <span className="shrink-0 font-semibold text-destructive-text">{lastConnectionError.sessionEnded ? 'Session ended:' : 'Connection failed:'}</span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{lastConnectionError.message}</span>
        </p>
      )}
      <OAuthSignInNotice />
    </div>
  );
}
