import type { KeyboardEvent } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent);

/** Ctrl+Enter or ⌘+Enter, the run shortcut for a Call's argument editor. */
export const isRunShortcut = (e: KeyboardEvent) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing;

interface RunButtonProps {
  label: string;
  running: boolean;
  disabled: boolean;
  /** Id of the element explaining why Run is blocked. */
  describedBy?: string | undefined;
  onClick: () => void;
}

export function RunButton({ label, running, disabled, describedBy, onClick }: RunButtonProps) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={running || disabled}
      aria-describedby={describedBy}
      aria-keyshortcuts="Control+Enter Meta+Enter"
      className="shrink-0 gap-1.5 text-xs"
    >
      <Play size={12} aria-hidden="true" className="fill-current" />
      {running ? 'Running…' : label}
      {!running && <kbd aria-hidden="true" className="ml-0.5 inline-flex h-4 items-center rounded-sm bg-primary-foreground/15 px-1 font-sans text-xs leading-none">{isMac ? '⌘ ↵' : 'Ctrl ↵'}</kbd>}
    </Button>
  );
}

/** "Required: city, tone" line that blocks Run; linked from the button via aria-describedby. */
export function RequiredNotice({ id, missing }: { id: string; missing: string[] }) {
  if (missing.length === 0) return null;
  return <p id={id} className="text-xs text-muted-foreground">Required: {missing.join(', ')}</p>;
}
