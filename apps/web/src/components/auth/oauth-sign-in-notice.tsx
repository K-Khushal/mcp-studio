import { Loader2 } from 'lucide-react';
import { useStore } from '@/store';

/** Shown while the Studio Server waits for OAuth sign-in to finish in the browser. */
export function OAuthSignInNotice() {
  const url = useStore((s) => s.oauthAuthorizationUrl);
  const disconnect = useStore((s) => s.disconnect);
  if (!url) return null;
  return (
    <div role="status" className="flex items-center gap-2 px-3 pb-3 text-xs text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />
      <span>Waiting for sign-in in your browser.</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
        Open sign-in page
      </a>
      <button onClick={() => void disconnect()} className="font-medium hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}
