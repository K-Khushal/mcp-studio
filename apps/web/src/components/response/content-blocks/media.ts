const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

export function toDataUri(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`;
}

export function downloadName(kind: 'image' | 'audio', mimeType: string): string {
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.trim();
  const ext = EXTENSIONS[mimeType] ?? (subtype && /^[a-z0-9.+-]+$/i.test(subtype) ? subtype : 'bin');
  return `${kind}.${ext}`;
}
