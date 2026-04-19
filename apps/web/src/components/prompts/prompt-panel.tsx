import { Send } from 'lucide-react';
import { useStore } from '@/store';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';

export function PromptPanel() {
  const { connectionStatus } = useStore();
  const [promptText, setPromptText] = useState('');

  return (
    <div className="flex flex-col gap-3 p-4">
      <Textarea
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
        className='resize-none'
        placeholder="Today's New York climate"
        rows={4}
      />
      <div className="flex justify-end">
        <button
          // onClick={sendPrompt}
          disabled={connectionStatus !== 'connected' || !promptText.trim()}
          className="flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={14} />
          Send Prompt
        </button>
      </div>
    </div>
  );
}
