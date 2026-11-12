import { expect, it } from 'vitest';
import { boundedText, limitResponseBody, BoundedLines, StderrEntries } from '../limits.js';

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
it.each(['\n', '\r', '\r\n'])('bounds individual SSE events across chunks (%j)', async newline => {
  const chunks = [...`data: ok${newline}${newline}data: ok${newline}${newline}`].map(c => new TextEncoder().encode(c));
  const response = new Response(new ReadableStream({ pull(c) { const next = chunks.shift(); if (next) c.enqueue(next); else c.close(); } }), { headers: { 'content-type': 'Text/Event-Stream; charset=utf-8' } });
  expect(await limitResponseBody(response, 16).text()).toContain('data: ok');
  await expect(limitResponseBody(new Response(`data: ${'x'.repeat(32)}\n\n`, { headers: { 'content-type': 'text/event-stream' } }), 16).text()).rejects.toThrow(/SSE event exceeds/);
});

function sseResponse(text: string, chunkSize: number) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(offset, offset + chunkSize));
    offset = Math.min(offset + chunkSize, bytes.length);
  } }), { headers: { 'content-type': 'text/event-stream' } });
}

it.each(['\n\n', '\r\n\r\n', '\r\r', '\n\r\n', '\r\n\n'])('preserves multiple SSE events at every chunk size with %j', async delimiter => {
  const input = `: comment\nretry: 100\nid: 7\ndata: 😀${delimiter}data: café${delimiter}`;
  for (let size = 1; size <= new TextEncoder().encode(input).length; size++) {
    expect(await limitResponseBody(sseResponse(input, size), 48).text()).toBe(': comment\nretry: 100\nid: 7\ndata: 😀\n\ndata: café\n\n');
  }
});

it('passes through unterminated SSE bytes at EOF without adding a dispatch delimiter', async () => {
  expect(await limitResponseBody(sseResponse('data: café', 1), 16).text()).toBe('data: café');
});

it.each([1, 2, 3, 8, 64])('enforces the per-event cap for CRLF chunks of %i bytes', async size => {
  await expect(limitResponseBody(sseResponse('data: ok\r\n\r\ndata: ' + 'x'.repeat(32) + '\r\n\r\n', size), 16).text()).rejects.toThrow('SSE event exceeds 16 bytes');
});
it('joins a pretty-printed object and stack frames into single stderr entries', () => {
  const entries: string[] = [];
  const stderr = new StderrEntries(entry => entries.push(entry));
  for (const line of ['[1] Connected', '[1] [Local→Remote] initialize', '[1] {', '  "method": "a{b",', '  "params": {}', '}', '', 'Error: boom', '    at main (x.js:1)', 'done']) stderr.push(line);
  stderr.flush();
  expect(entries).toEqual(['[1] Connected', '[1] [Local→Remote] initialize', '[1] {\n  "method": "a{b",\n  "params": {}\n}', 'Error: boom\n    at main (x.js:1)', 'done']);
});
it('emits a pending stderr entry after a quiet period', async () => {
  const entries: string[] = [];
  const stderr = new StderrEntries(entry => entries.push(entry), 5);
  stderr.push('ready');
  expect(entries).toEqual([]);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(entries).toEqual(['ready']);
});
