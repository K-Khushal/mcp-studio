import { isCallToolResult, isPromptMessages } from '@mcp-studio/types';
import type { CallToolResult, MCPPromptMessage } from '@mcp-studio/types';
import { AlertTriangle } from 'lucide-react';
import { ContentBlockRenderer } from './content-blocks/content-block-renderer';
import { JsonViewer } from './json-viewer';

function ToolErrorBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 mb-4 text-xs text-destructive">
      <AlertTriangle size={13} className="shrink-0" />
      <span className="font-medium">Tool execution error</span>
    </div>
  );
}

function MultiBlockSeparator() {
  return <div className="h-px bg-border/50 my-3" />;
}

function CallToolResultView({ result }: { result: CallToolResult }) {
  const blocks = result.content;

  return (
    <div>
      {result.isError && <ToolErrorBanner />}
      {blocks.map((block, i) => (
        <div key={i}>
          {i > 0 && <MultiBlockSeparator />}
          <ContentBlockRenderer block={block} />
        </div>
      ))}
      {blocks.length === 0 && (
        <span className="text-xs text-muted-foreground italic">Empty response</span>
      )}
    </div>
  );
}

function PromptMessagesView({ messages }: { messages: MCPPromptMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((msg, i) => (
        <div key={i} className="rounded-md border border-border overflow-hidden">
          <div className="flex items-center px-3 py-1.5 bg-muted/40 border-b border-border">
            <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground">
              {msg.role}
            </span>
          </div>
          <div className="p-3">
            {msg.content.type === 'text' ? (
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-foreground">
                {msg.content.text}
              </pre>
            ) : (
              <JsonViewer data={msg.content} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PrettyTabProps {
  result: unknown;
  error: string | null;
}

export function PrettyTab({ result, error }: PrettyTabProps) {
  if (error) {
    return (
      <pre className="text-xs font-mono text-destructive whitespace-pre-wrap">{error}</pre>
    );
  }

  if (result === null) return null;

  if (isCallToolResult(result)) {
    return <CallToolResultView result={result} />;
  }

  if (isPromptMessages(result)) {
    return <PromptMessagesView messages={result} />;
  }

  return <JsonViewer data={result} />;
}

export function hasToolError(result: unknown): boolean {
  return isCallToolResult(result) && result.isError === true;
}
