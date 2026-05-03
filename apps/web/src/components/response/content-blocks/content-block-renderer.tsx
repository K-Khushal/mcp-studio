import type { ContentBlock } from '@mcp-studio/types';
import { TextBlock } from './text-block';
import { ResourceBlock } from './resource-block';
import { ResourceLinkBlock } from './resource-link-block';
import { UnsupportedBlock } from './unsupported-block';

export function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlock block={block} />;
    case 'resource':
      return <ResourceBlock block={block} />;
    case 'resource_link':
      return <ResourceLinkBlock block={block} />;
    case 'image':
      return <UnsupportedBlock type="image" mimeType={block.mimeType} />;
    case 'audio':
      return <UnsupportedBlock type="audio" mimeType={block.mimeType} />;
    default: {
      const _exhaustive: never = block; // compile-time exhaustiveness check
      const unknown = _exhaustive as { type?: string };
      return <UnsupportedBlock type={unknown.type ?? 'unknown'} />;
    }
  }
}
