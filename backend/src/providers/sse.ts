/**
 * Parses raw SSE byte streams into frame data payloads.
 * Handles:
 * - UTF-8 decoding with stream: true
 * - Line buffering across arbitrary chunk splits
 * - Comment lines starting with ':' (keep-alives)
 * - Blank lines as frame delimiters
 * - \r\n and \n line endings
 */
export type SseByteSource =
  | ReadableStream<Uint8Array>
  | {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel?(reason?: any): Promise<any>;
      releaseLock?(): void;
    };

export async function* parseSseBytes(
  source: SseByteSource
): AsyncGenerator<{ data: string }, void, unknown> {
  const reader = 'getReader' in source ? (source as ReadableStream<Uint8Array>).getReader() : source;
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  let isDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        isDone = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Retain the trailing incomplete line in the buffer
      buffer = lines.pop() ?? '';

      let currentDataLines: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');

        if (line.startsWith(':')) {
          // Comment line (e.g. : OPENROUTER PROCESSING keep-alive) -> ignore
          continue;
        }

        if (line.startsWith('data:')) {
          const content = line.slice(5).trimStart();
          currentDataLines.push(content);
        } else if (line.trim().length === 0) {
          // Blank line -> frame delimiter
          if (currentDataLines.length > 0) {
            yield { data: currentDataLines.join('\n') };
            currentDataLines = [];
          }
        }
      }

      if (currentDataLines.length > 0) {
        // In case blank line didn't follow yet, keep data lines for the next frame
        buffer = currentDataLines.map((d) => `data: ${d}`).join('\n') + '\n' + buffer;
      }
    }

    // Flush any remaining decoder output
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const lines = buffer.split('\n');
      const dataLines: string[] = [];
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (dataLines.length > 0) {
        yield { data: dataLines.join('\n') };
      }
    }
  } finally {
    if (!isDone) {
      try {
        await reader.cancel?.();
      } catch {}
    }
    try {
      reader.releaseLock?.();
    } catch {}
  }
}
