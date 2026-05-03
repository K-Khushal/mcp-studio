import type { TextContent } from '@mcp-studio/types';
import { JsonViewer } from '../json-viewer';
import { tryParseJson } from './utils';

export function TextBlock({ block }: { block: TextContent }) {
  const parsed = tryParseJson(block.text);

  if (parsed !== null) {
    return <JsonViewer data={parsed} />;
  }

  return (
    <pre className="text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-words">
      {block.text}
    </pre>
  );
}
