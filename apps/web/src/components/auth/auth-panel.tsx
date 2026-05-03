import { useStore } from '@/store';
import type { HttpAuth } from '@mcp-studio/types';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const AUTH_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'apikey', label: 'API Key' },
] as const;

export function AuthPanel() {
  const { httpAuth, setHttpAuth } = useStore();

  const handleTypeChange = (type: HttpAuth['type']) => {
    if (type === 'none') setHttpAuth({ type: 'none' });
    else if (type === 'bearer') setHttpAuth({ type: 'bearer', token: '' });
    else setHttpAuth({ type: 'apikey', key: '', value: '', in: 'header' });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Auth type selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Auth Type</label>
        <div className="flex rounded-md overflow-hidden border border-border text-xs w-fit">
          {AUTH_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => handleTypeChange(t.value)}
              className={cn(
                'px-3 py-1.5 font-medium transition-colors',
                httpAuth.type === t.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bearer token */}
      {httpAuth.type === 'bearer' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Token</label>
          <Input
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
              <label className="text-xs font-medium text-muted-foreground">Key</label>
              <Input
                value={httpAuth.key}
                onChange={(e) => setHttpAuth({ ...httpAuth, key: e.target.value })}
                placeholder="x-api-key"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Value</label>
              <Input
                value={httpAuth.value}
                onChange={(e) => setHttpAuth({ ...httpAuth, value: e.target.value })}
                placeholder="Enter value or {{ENV_VAR}}"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Add to</label>
            <div className="flex rounded-md overflow-hidden border border-border text-xs w-fit">
              {(['header', 'query'] as const).map((loc) => (
                <button
                  key={loc}
                  onClick={() => setHttpAuth({ ...httpAuth, in: loc })}
                  className={cn(
                    'px-3 py-1.5 font-medium transition-colors capitalize',
                    httpAuth.in === loc
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  {loc === 'header' ? 'Header' : 'Query Param'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {httpAuth.type === 'none' && (
        <p className="text-xs text-muted-foreground">No authentication will be sent with this connection.</p>
      )}
    </div>
  );
}
