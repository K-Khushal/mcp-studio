import { useEffect, useState } from 'react';
import { Clock, Loader2, Square } from 'lucide-react';
import { useStore } from '@/store';

/** Only the running status ticks; the response and timeline do not rerender on a timer. */
export function LiveCallStatus() {
  const startedAt = useStore(s => s.response.startedAt);
  const cancelCall = useStore(s => s.cancelCall);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [startedAt]);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
      <span role="timer" className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
        <Clock size={14} aria-hidden="true" />
        {(Math.max(0, now - (startedAt ?? now)) / 1000).toFixed(1)}s elapsed
      </span>
      <button
        onClick={cancelCall}
        aria-label="Cancel Call"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:enabled:active:scale-[0.96]"
      >
        <Square size={12} aria-hidden="true" /> Cancel
      </button>
    </div>
  );
}

export function LoadingState() {
  const progress = useStore(s => s.response.progress);
  const total = progress?.total;
  const determinate = total !== undefined && total > 0;
  return (
    <div className="flex h-full items-center justify-center px-4 text-sm">
      <div className="w-full max-w-sm space-y-3">
        <div role="status" className="flex items-center gap-2 text-muted-foreground">
          <Loader2 size={16} aria-hidden="true" className="shrink-0 motion-safe:animate-spin" />
          <span className="break-words">{progress?.message || 'Waiting for response…'}</span>
        </div>
        {progress && <>
          <p className="text-xs tabular-nums text-muted-foreground">{total !== undefined ? `${progress.progress} / ${total}` : `Progress: ${progress.progress}`}</p>
          {determinate && <div
            role="progressbar"
            aria-label="Call progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={progress.progress}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, progress.progress / total * 100))}%` }} />
          </div>}
        </>}
      </div>
    </div>
  );
}
