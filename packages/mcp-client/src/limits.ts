const encoder = new TextEncoder();
export function boundedText(text: string, maxBytes = 16 * 1024): string {
  const bytes = encoder.encode(text);
  return bytes.length <= maxBytes ? text : new TextDecoder().decode(bytes.subarray(0, maxBytes)) + ` [truncated, ${bytes.length} bytes]`;
}

/** Keeps only the prefix of a line, discarding overflow until its newline. */
export class BoundedLines {
  private prefix = '';
  private bytes = 0;
  constructor(private emit: (line: string) => void, private maxBytes = 16 * 1024) {}
  write(chunk: string) {
    const parts = chunk.split('\n');
    parts.forEach((part, index) => {
      this.bytes += encoder.encode(part).length;
      if (this.prefix.length < this.maxBytes) this.prefix += part.slice(0, this.maxBytes - this.prefix.length);
      if (index < parts.length - 1) this.flush();
    });
  }
  flush() {
    if (this.bytes) this.emit(boundedText(this.prefix, this.maxBytes) + (this.bytes > this.maxBytes ? ` [truncated, ${this.bytes} bytes]` : ''));
    this.prefix = '';
    this.bytes = 0;
  }
}

/** Bound JSON bodies cumulatively and SSE events individually before SDK parsing. */
export function limitResponseBody(response: Response, maxBytes = 4 * 1024 * 1024, onSseLimit?: (error: Error) => void): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const sse = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'text/event-stream';
  let bytes = 0;
  let lineBytes = 0;
  let afterCR = false;
  let dropping = false;
  // Hold at most one bounded event so a dropped prefix never reaches the SDK parser.
  let event: number[] = [];
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          // Preserve bounded bytes at EOF without inventing a blank line. The SDK's
          // parser does not dispatch an unterminated event (it has no flush).
          if (sse && !dropping && event.length) controller.enqueue(Uint8Array.from(event));
          controller.close(); return;
        }
        if (sse) {
          const kept: number[] = [];
          for (const byte of next.value) {
            // Normalize CR/CRLF to LF so the SDK can dispatch the final event
            // without needing another byte after a trailing CR.
            if (afterCR && byte === 10) { afterCR = false; continue; }
            afterCR = byte === 13;
            bytes++;
            if (bytes > maxBytes && !dropping) {
              if (!onSseLimit) throw new Error(`SSE event exceeds ${maxBytes} bytes; dropped`);
              event = [];
              dropping = true;
              onSseLimit(new Error(`SSE event exceeds ${maxBytes} bytes; dropped`));
            }
            if (!dropping) event.push(byte === 13 ? 10 : byte);
            if (byte === 10 || byte === 13) {
              if (lineBytes === 0) {
                bytes = 0;
                if (!dropping) { for (const value of event) kept.push(value); }
                event = [];
                dropping = false;
              }
              lineBytes = 0;
            } else lineBytes++;
          }
          controller.enqueue(Uint8Array.from(kept));
          return;
        } else bytes += next.value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          controller.error(new Error(`HTTP ${sse ? "SSE event" : "body"} exceeds ${maxBytes} bytes (truncated)`));
          return;
        }
        controller.enqueue(next.value);
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
