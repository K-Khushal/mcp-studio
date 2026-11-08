import type { ImageContent } from '@mcp-studio/types';
import { Image as ImageIcon } from 'lucide-react';
import { MediaFrame } from './media-frame';
import { downloadName, toDataUri } from './media';

export function ImageBlock({ block }: { block: ImageContent }) {
  const src = toDataUri(block.mimeType, block.data);

  return (
    <MediaFrame
      icon={<ImageIcon size={12} />}
      mimeType={block.mimeType}
      href={src}
      filename={downloadName('image', block.mimeType)}
    >
      <img
        src={src}
        alt={`Image response (${block.mimeType})`}
        className="mx-auto max-h-96 max-w-full rounded-md object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      />
    </MediaFrame>
  );
}
