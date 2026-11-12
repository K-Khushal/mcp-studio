import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, LogIn, LogOut, UserRound } from 'lucide-react';
import type { OAuthStatus } from '@mcp-studio/types';
import { useStore } from '@/store';
import { studioFetch } from '@/lib/studio-access';
import { buildConnectionConfig, isConnectable } from '@/store/connection-form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function expiryLabel(expiresAt: number, refreshable: boolean): string {
  const minutes = Math.round((expiresAt - Date.now()) / 60_000);
  if (minutes <= 0) return refreshable ? 'Access token expired; renews on next connect' : 'Access token expired; sign in again';
  const left = minutes < 60 ? `${minutes} min` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} days`;
  return `Access token expires in ${left}${refreshable ? ', renews automatically' : ''}`;
}

const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** Sign-in state for an OAuth Connection: who is signed in, or a Sign in button that connects. */
export function OAuthStatusCard({ collectionId }: { collectionId: string | undefined }) {
  const connectionId = useStore((s) => s.selectedConnectionId);
  const connectionStatus = useStore((s) => s.connectionStatus);
  const connectedConnectionId = useStore((s) => s.connectedConnectionId);
  const connectingConnectionId = useStore((s) => s.connectingConnectionId);
  const waitingForBrowser = useStore((s) => s.oauthAuthorizationUrl !== null);
  const { signOut, connect, transport, stdio, connectionUrl, httpHeaders, httpAuth } = useStore();
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [revision, setRevision] = useState(0);

  // Sign-in completes during connect, so refetch whenever the Session or browser approval changes.
  useEffect(() => {
    if (!collectionId || !connectionId) return;
    let current = true;
    studioFetch(`/api/collections/${collectionId}/connections/${connectionId}/oauth`)
      .then(async (response) => { if (current) setStatus(response.ok ? await response.json() as OAuthStatus : null); })
      .catch(() => { if (current) setStatus(null); });
    return () => { current = false; };
  }, [collectionId, connectionId, connectionStatus, waitingForBrowser, revision]);

  if (!collectionId || !connectionId) {
    return <p className="text-xs text-muted-foreground">Save this Connection to a Collection to sign in.</p>;
  }

  const live = connectedConnectionId === connectionId && connectionStatus === 'connected';
  const connecting = connectingConnectionId === connectionId && connectionStatus === 'connecting';
  const config = buildConnectionConfig({ transport, stdio, connectionUrl, httpHeaders, httpAuth });
  const signedIn = status?.signedIn === true;
  const account = status?.account;
  const primary = account?.email ?? account?.username ?? account?.name ?? account?.subject;
  const secondary = account?.name && account.name !== primary ? account.name : undefined;

  const handleSignOut = async () => {
    if (await signOut(collectionId, connectionId)) {
      toast.success('Signed out', { description: 'The next connect will ask you to sign in again.' });
      setRevision((r) => r + 1);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', signedIn ? 'bg-success/15 text-success-text' : 'bg-muted text-muted-foreground')}>
            <UserRound size={16} aria-hidden />
          </span>
          <div className="min-w-0 text-xs">
            <p className="flex items-center gap-1.5 font-medium">
              <span aria-hidden className={cn('size-2 rounded-full', signedIn ? 'bg-success' : waitingForBrowser && connecting ? 'bg-warning' : 'bg-muted-foreground/50')} />
              {status === null ? 'Checking sign-in…' : signedIn ? 'Signed in' : waitingForBrowser && connecting ? 'Waiting for browser sign-in' : 'Not signed in'}
            </p>
            {signedIn && (
              <p className="truncate text-muted-foreground" title={primary}>
                {primary ? <><span className="text-foreground">{primary}</span>{secondary && ` · ${secondary}`}</> : 'Account details not shared by this server'}
                {status.serverUrl && ` · ${host(status.serverUrl)}`}
              </p>
            )}
            {!signedIn && status !== null && (
              <p className="text-muted-foreground">
                {live ? 'Connected without sign-in: this server did not ask for it.' : 'Sign in opens your browser when the server asks for it.'}
              </p>
            )}
          </div>
        </div>
        {signedIn ? (
          <Button variant="destructive" size="sm" onClick={() => void handleSignOut()}>
            <LogOut aria-hidden /> Sign out
          </Button>
        ) : (
          <Button size="sm" disabled={live || connecting || !isConnectable(config)} onClick={() => connect(config)}>
            {connecting ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : <LogIn aria-hidden />} {connecting ? 'Signing in…' : 'Sign in'}
          </Button>
        )}
      </div>
      {signedIn && (status.scope || status.expiresAt !== undefined) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {status.scope && <><dt>Scopes</dt><dd className="break-all font-mono text-foreground">{status.scope}</dd></>}
          {status.expiresAt !== undefined && <><dt>Token</dt><dd className="text-foreground">{expiryLabel(status.expiresAt, status.refreshable === true)}</dd></>}
        </dl>
      )}
    </div>
  );
}
