import { Loader2 } from 'lucide-react';

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
      <Loader2 size={20} className="animate-spin opacity-50" />
      Waiting for response…
    </div>
  );
}
