import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CopyButtonProps {
  text: string | null;
  label?: string;
}

export function CopyButton({ text, label = 'Copy response' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error('Could not copy to clipboard', { duration: 10_000 });
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={text === null}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cn(
        'flex size-6 items-center justify-center rounded-md transition-[color,background-color,transform] duration-150 ease-out',
        'text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.96]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-40',
        copied && 'text-success-text',
      )}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}
