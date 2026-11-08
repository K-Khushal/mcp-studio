import type { AudioContent } from '@mcp-studio/types';
import { Volume2 } from 'lucide-react';
import { MediaFrame } from './media-frame';
import { downloadName, toDataUri } from './media';

export function AudioBlock({ block }: { block: AudioContent }) {
  const src = toDataUri(block.mimeType, block.data);

  return (
    <MediaFrame
      icon={<Volume2 size={12} />}
      mimeType={block.mimeType}
      href={src}
      filename={downloadName('audio', block.mimeType)}
    >
      <audio controls preload="metadata" src={src} className="w-full" />
    </MediaFrame>
  );
}
