const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
};

function normalizeMime(mimeType: string): string {
  return (mimeType.split(';')[0] ?? '').trim().toLowerCase();
}

export function toDataUri(mimeType: string, base64: string): string {
  mimeType = normalizeMime(mimeType);
  return `data:${Object.hasOwn(EXTENSIONS, mimeType) ? mimeType : "application/octet-stream"};base64,${base64}`;
}

export function downloadName(kind: 'image' | 'audio', mimeType: string): string {
  mimeType = normalizeMime(mimeType);
  const ext = Object.hasOwn(EXTENSIONS, mimeType) ? EXTENSIONS[mimeType] : 'bin';
  return `${kind}.${ext}`;
}
