import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export function TimelinePanel() {
  const { timeline } = useStore();

  if (timeline.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">No timeline data yet</div>;
  }

  return (
    <div className="flex flex-col gap-0">
      {timeline.map((step, i) => (
        <div key={`${step.label}-${step.timestamp}-${i}`} className="flex gap-2">
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
              step.status === 'completed' ? 'text-success-text' : step.status === 'active' ? 'text-primary-text' : 'text-muted-foreground'
            )}>
              {step.status === 'completed'
                ? <CheckCircle2 size={16} />
                : step.status === 'active'
                  ? <Loader2 size={16} className="motion-safe:animate-spin" />
                  : <Circle size={16} />}
            </div>
            {i < timeline.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-2" />
            )}
          </div>
          <div className="flex flex-1 min-w-0 items-start gap-3 pb-2 text-xs leading-5">
            <p className="flex-1 min-w-0 break-words">
              <span className="font-semibold text-foreground">{step.label}</span>
              {step.detail && <span className="text-muted-foreground"> · {step.detail}</span>}
            </p>
            <div className="flex shrink-0 gap-3 font-mono tabular-nums text-muted-foreground">
              {step.durationMs !== undefined && <span>{step.durationMs}ms{step.scope === 'call' ? ' since sent' : ''}</span>}
              <span>{step.timestamp}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
