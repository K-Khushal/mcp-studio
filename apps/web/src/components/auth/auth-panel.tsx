import { useStore } from '@/store';
import type { HttpAuth } from '@mcp-studio/types';
import { useId } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Input } from '@/components/ui/input';
import { VariableInput } from '@/components/shared/variable-input';
import { OAuthStatusCard } from './oauth-status';

const AUTH_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'apikey', label: 'API Key' },
  { value: 'oauth', label: 'OAuth' },
] as const;

export function AuthPanel() {
  const id = useId();
  const { httpAuth, setHttpAuth, selectedConnectionId, collections } = useStore();
  const selectedCollection = collections.find((c) => c.connections.some((r) => r.id === selectedConnectionId));

  const handleTypeChange = (type: HttpAuth['type']) => {
    if (type === 'none') setHttpAuth({ type: 'none' });
    else if (type === 'bearer') setHttpAuth({ type: 'bearer', token: '' });
    else if (type === 'oauth') setHttpAuth({ type: 'oauth' });
    else setHttpAuth({ type: 'apikey', key: '', value: '', in: 'header' });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Auth type selector */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">Auth type</div>
        <SegmentedControl aria-label="Auth type" value={httpAuth.type} onValueChange={handleTypeChange} options={AUTH_TYPES} />
      </div>

      {/* Bearer token */}
      {httpAuth.type === 'bearer' && (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-token`} className="text-xs font-medium text-muted-foreground">Token</label>
          <VariableInput
            id={`${id}-token`}
            value={httpAuth.token}
            onChange={(e) => setHttpAuth({ type: 'bearer', token: e.target.value })}
            placeholder="Enter bearer token or {{ENV_VAR}}"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Sent as <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;token&gt;</code>
          </p>
        </div>
      )}

      {/* API Key */}
      {httpAuth.type === 'apikey' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-key`} className="text-xs font-medium text-muted-foreground">Key</label>
              <Input
                id={`${id}-key`}
                value={httpAuth.key}
                onChange={(e) => setHttpAuth({ ...httpAuth, key: e.target.value })}
                placeholder="x-api-key"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-value`} className="text-xs font-medium text-muted-foreground">Value</label>
              <VariableInput
                id={`${id}-value`}
                value={httpAuth.value}
                onChange={(e) => setHttpAuth({ ...httpAuth, value: e.target.value })}
                placeholder="Enter value or {{ENV_VAR}}"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Add to</div>
            <SegmentedControl aria-label="API-key location" value={httpAuth.in} onValueChange={location => setHttpAuth({ ...httpAuth, in: location })} options={[{ value: 'header', label: 'Header' }, { value: 'query', label: 'Query Param' }]} />
          </div>
        </div>
      )}

      {/* OAuth */}
      {httpAuth.type === 'oauth' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground max-w-prose">
            On connect, Studio discovers the MCP Server&apos;s authorization server, registers itself and opens
            sign-in in your browser. Tokens stay on this machine, saved with this Connection, and refresh automatically.
          </p>
          <OAuthStatusCard collectionId={selectedCollection?.id} />
        </div>
      )}

      {httpAuth.type === 'none' && (
        <p className="text-xs text-muted-foreground">No authentication will be sent with this connection.</p>
      )}
    </div>
  );
}
