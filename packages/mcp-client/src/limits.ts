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
export function limitResponseBody(response: Response, maxBytes = 4 * 1024 * 1024): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const sse = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'text/event-stream';
  let bytes = 0;
  let lineBytes = 0;
  let afterCR = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { controller.close(); return; }
        if (sse) {
          for (const byte of next.value) {
            if (afterCR && byte === 10) { afterCR = false; continue; }
            afterCR = byte === 13;
            bytes++;
            if (bytes > maxBytes) break;
            if (byte === 10 || byte === 13) {
              if (lineBytes === 0) bytes = 0;
              lineBytes = 0;
            } else lineBytes++;
          }
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
