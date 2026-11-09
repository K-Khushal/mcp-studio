import { isCallToolResult, isPromptMessages } from '@mcp-studio/types';
import type { CallToolResult, MCPPromptMessage } from '@mcp-studio/types';
import { StructuredOutput } from './structured-output';
import { AlertTriangle } from 'lucide-react';
import { ContentBlockRenderer } from './content-blocks/content-block-renderer';
import { JsonViewer } from './json-viewer';

function ToolErrorBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 mb-4 text-xs text-destructive-text">
      <AlertTriangle size={13} className="shrink-0" />
      <span className="font-medium">Tool execution error</span>
    </div>
  );
}

function MultiBlockSeparator() {
  return <div className="h-px bg-border/50 my-3" />;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(key => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]));
}

function isTextMirror(result: CallToolResult): boolean {
  const [block] = result.content;
  if (result.structuredContent === undefined || result.content.length !== 1 || block?.type !== 'text') return false;
  try {
    return jsonEqual(JSON.parse(block.text), result.structuredContent);
  } catch {
    return false;
  }
}

function CallToolResultView({ result, outputSchema }: { result: CallToolResult; outputSchema?: Record<string, unknown> }) {
  const blocks = result.content;
  const textMirror = isTextMirror(result);

  return (
    <div>
      {result.isError && <ToolErrorBanner />}
      <StructuredOutput result={result} schema={outputSchema} />
      {textMirror ? <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Content (text mirror)</summary>
        <ContentBlockRenderer block={blocks[0]!} />
      </details> : blocks.map((block, i) => (
        <div key={i}>
          {i > 0 && <MultiBlockSeparator />}
          <ContentBlockRenderer block={block} />
        </div>
      ))}
      {blocks.length === 0 && result.structuredContent === undefined && (
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
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider text-muted-foreground">
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
  outputSchema?: Record<string, unknown>;
}

export function PrettyTab({ result, error, outputSchema }: PrettyTabProps) {
  if (error) {
    return (
      <pre className="text-xs font-mono text-destructive-text whitespace-pre-wrap">{error}</pre>
    );
  }

  if (result === null) return null;

  if (isCallToolResult(result)) {
    return <CallToolResultView result={result} outputSchema={outputSchema} />;
  }

  if (isPromptMessages(result)) {
    return <PromptMessagesView messages={result} />;
  }

  return <JsonViewer data={result} />;
}

export function hasToolError(result: unknown): boolean {
  return isCallToolResult(result) && result.isError === true;
}
