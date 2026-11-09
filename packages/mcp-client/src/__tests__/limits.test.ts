import { expect, it } from 'vitest';
import { boundedText, limitResponseBody, BoundedLines } from '../limits.js';

it('bounds Unicode text and reports original byte count', () => {
  expect(boundedText('😀'.repeat(100), 16)).toContain('truncated, 400 bytes');
  expect(new TextEncoder().encode(boundedText('😀'.repeat(100), 16)).length).toBeLessThan(100);
});
it('bounds an unterminated stderr stream and resumes at a newline', () => {
  const lines: string[] = [];
  const buffer = new BoundedLines(line => lines.push(line), 16);
  for (let i = 0; i < 100; i++) buffer.write('x'.repeat(100));
  buffer.write('\nready\n');
  expect(lines[0]).toContain('truncated, 10000 bytes');
  expect(lines[1]).toBe('ready');
});
it('cancels oversized HTTP bodies while allowing bounded responses', async () => {
  const response = limitResponseBody(new Response('x'.repeat(100)), 16);
  await expect(response.text()).rejects.toThrow(/exceeds 16 bytes/);
  expect(await limitResponseBody(new Response('ok'), 16).text()).toBe('ok');
});
