import { isCallToolResult, isPromptMessages } from '@mcp-studio/types';
import type { ContentBlock } from '@mcp-studio/types';
import type { ResponseTab } from './response-header';

const encoder = new TextEncoder();

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** UTF-8 size of what the Raw tab shows, compact-serialized; null when empty. */
export function getResponseSize(result: unknown, error: string | null): number | null {
  if (error !== null) return encoder.encode(error).length;
  if (result === null) return null;
  return encoder.encode(JSON.stringify(result)).length;
}

function blockToText(block: ContentBlock): string {
  switch (block.type) {
    case 'text':
      return block.text;
    case 'image':
    case 'audio':
      return `[${block.type}: ${block.mimeType}]`;
    case 'resource_link':
      return block.uri;
    case 'resource':
      return block.resource.text ?? `[resource: ${block.resource.uri}]`;
  }
}

function prettyText(result: unknown): string {
  if (isCallToolResult(result)) return result.content.map(blockToText).join('\n\n');
  if (isPromptMessages(result)) {
    return result
      .map((m) => `${m.role}: ${m.content.type === 'text' ? m.content.text : JSON.stringify(m.content)}`)
      .join('\n\n');
  }
  return JSON.stringify(result, null, 2);
}

/** Text the copy button yields for the active tab; null when there is nothing to copy. */
export function getCopyText(
  tab: ResponseTab,
  result: unknown,
  error: string | null,
  responseHeaders: Record<string, string> | null,
): string | null {
  if (tab === 'timeline') return null;
  if (tab === 'headers') return responseHeaders ? JSON.stringify(responseHeaders, null, 2) : null;
  if (error !== null) return error;
  if (result === null) return null;
  return tab === 'raw' ? JSON.stringify(result, null, 2) : prettyText(result);
}
