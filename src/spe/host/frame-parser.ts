// src/spe/host/frame-parser.ts
import type { Frame, FrameListener, StreamKind } from './types.js';

const FRAME_PREFIX = '__M_FRAME__';

export interface FrameParser {
  /** Feed a chunk of stdout. Emits frames synchronously via the listener as full lines complete. */
  feed(chunk: Buffer): void;
  /** Emit any buffered partial line as a stream frame. Call on child exit. */
  flush(): void;
}

export interface FrameParserOptions {
  /** Default stream kind for non-frame lines. Default 'stdout'. Set 'stderr' for stderr parser. */
  stream?: StreamKind;
}

export function createFrameParser(listener: FrameListener, opts: FrameParserOptions = {}): FrameParser {
  const stream: StreamKind = opts.stream ?? 'stdout';
  let buffer = '';

  function emitLine(line: string) {
    // pwsh on alpine with PSReadLine 2.3.5 prefixes Write-Host output with
    // terminal cursor-mode escapes (e.g. ESC[?1h, ESC[?1l) when the host is
    // launched with -NoExit -Command - and a piped stdin. The frame prefix
    // moves off column 0; strip leading CSI sequences before the prefix
    // check so the framed line is still recognised. We only strip for the
    // prefix lookup - if the line is plain stdout the escapes are preserved
    // in the emitted payload so the output panel can render them.
    const stripped = line.replace(/^(?:\x1b\[[0-9;?]*[A-Za-z])+/, '');
    if (stripped.startsWith(FRAME_PREFIX)) {
      const json = stripped.slice(FRAME_PREFIX.length);
      try {
        const frame = JSON.parse(json) as Frame;
        if (typeof frame === 'object' && frame !== null && typeof frame.type === 'string') {
          listener(frame);
          return;
        }
      } catch {
        // fall through to plain-stdout handling
      }
    }
    listener({ type: 'stream', stream, data: line });
  }

  return {
    feed(chunk: Buffer) {
      buffer += chunk.toString('utf-8');
      // Split on \n; keep the last partial in the buffer.
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, idx);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        buffer = buffer.slice(idx + 1);
        emitLine(line);
      }
    },
    flush() {
      if (buffer.length === 0) return;
      let line = buffer;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      buffer = '';
      emitLine(line);
    },
  };
}
