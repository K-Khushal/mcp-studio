import { expect, it } from 'vitest';
import { downloadName, toDataUri } from '../components/response/content-blocks/media';

it('normalizes media MIME case and parameters before allowlist lookup', () => {
  expect(toDataUri(' Image/PNG; charset=utf-8 ', 'YWJj')).toBe('data:image/png;base64,YWJj');
  expect(downloadName('audio', 'Audio/MPEG; codecs=mp3')).toBe('audio.mp3');
  expect(toDataUri('image/svg+xml; charset=utf-8', 'YWJj')).toBe('data:application/octet-stream;base64,YWJj');
  expect(downloadName('image', 'unknown/type')).toBe('image.bin');
});
