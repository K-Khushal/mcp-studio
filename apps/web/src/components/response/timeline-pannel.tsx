import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';

export function TimelinePanel() {
  const { timeline } = useStore();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (timeline.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">No timeline data yet</div>;
  }

  return (
    <div className="flex flex-col gap-0">
      {timeline.map((step, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
              step.status === 'completed' ? 'text-success' : step.status === 'active' ? 'text-primary' : 'text-muted-foreground'
            )}>
              {step.status === 'completed' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </div>
            {i < timeline.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-6" />
            )}
          </div>
          <div className="pb-4 flex-1 min-w-0">
            <button
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              className="text-xs font-semibold text-foreground hover:text-primary transition-colors text-left"
            >
              {step.label}
              <span className="ml-2 font-mono text-muted-foreground font-normal">{step.timestamp}</span>
            </button>
            {(expandedIdx === i || true) && (
              <p className="text-xs font-mono text-muted-foreground mt-0.5 break-all">{step.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
