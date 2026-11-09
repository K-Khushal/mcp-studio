import { Inbox } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
      <Inbox size={20} className="opacity-30" />
      Run a tool or prompt to see the response
    </div>
  );
}
