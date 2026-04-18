import { cn } from '@/lib/utils';
import { useStore } from "@/store";
import EnvironmentPannel from '../environments/environment-pannel';
import { ConfigurationPanel } from '../configuration/configuration-pannel';
import { Loader2, Plug, Unplug } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function ConnectionPanel() {
  const { connectionStatus, connect, disconnect } = useStore();
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio');
  const [ connectionUrl, setConnectionUrl ] = useState<string>('');

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="border-b border-border bg-card">
      {/* Header row: Status, Environment, Configuration */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground font-mono bg-muted px-2 py-0.5 rounded">untitled</span>
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
        <EnvironmentPannel />
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
          placeholder={transport === 'stdio' ? 'npx @test/test-mcp' : 'http://localhost:4000'}
          className="flex-1"
        />

        <button
          // onClick={isConnected ? disconnect : connect}
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
