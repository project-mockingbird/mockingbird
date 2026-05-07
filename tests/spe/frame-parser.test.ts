// tests/spe/frame-parser.test.ts
import { describe, it, expect } from 'vitest';
import { createFrameParser } from '../../src/spe/host/frame-parser.js';
import type { Frame } from '../../src/spe/host/types.js';

describe('createFrameParser', () => {
  function collect(): { frames: Frame[]; parse: (chunk: string | Buffer) => void; flush: () => void } {
    const frames: Frame[] = [];
    const parser = createFrameParser((f) => frames.push(f));
    return {
      frames,
      parse: (chunk) => parser.feed(typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk),
      flush: () => parser.flush(),
    };
  }

  it('emits a stream frame for plain output lines', () => {
    const { frames, parse } = collect();
    parse('hello world\n');
    expect(frames).toEqual([{ type: 'stream', stream: 'stdout', data: 'hello world' }]);
  });

  it('emits a typed frame for __M_FRAME__ lines', () => {
    const { frames, parse } = collect();
    parse('__M_FRAME__{"type":"runStarted","runId":"abc"}\n');
    expect(frames).toEqual([{ type: 'runStarted', runId: 'abc' }]);
  });

  it('handles multiple lines in one chunk', () => {
    const { frames, parse } = collect();
    parse('first\nsecond\n__M_FRAME__{"type":"runAborted","runId":"x"}\n');
    expect(frames).toHaveLength(3);
    expect(frames[0]).toEqual({ type: 'stream', stream: 'stdout', data: 'first' });
    expect(frames[1]).toEqual({ type: 'stream', stream: 'stdout', data: 'second' });
    expect(frames[2]).toEqual({ type: 'runAborted', runId: 'x' });
  });

  it('buffers across chunk boundaries (line split mid-text)', () => {
    const { frames, parse } = collect();
    parse('hel');
    parse('lo\n');
    expect(frames).toEqual([{ type: 'stream', stream: 'stdout', data: 'hello' }]);
  });

  it('buffers across chunk boundaries (frame split mid-JSON)', () => {
    const { frames, parse } = collect();
    parse('__M_FRAME__{"type":"run');
    parse('Complete","runId":"r1","exitCode":0,"durationMs":5}\n');
    expect(frames).toEqual([{ type: 'runComplete', runId: 'r1', exitCode: 0, durationMs: 5 }]);
  });

  it('treats malformed __M_FRAME__ JSON as plain stdout (does not crash)', () => {
    const { frames, parse } = collect();
    parse('__M_FRAME__not-json-at-all\n');
    expect(frames).toEqual([{ type: 'stream', stream: 'stdout', data: '__M_FRAME__not-json-at-all' }]);
  });

  it('flush() emits any trailing line without a newline', () => {
    const { frames, parse, flush } = collect();
    parse('orphan');
    flush();
    expect(frames).toEqual([{ type: 'stream', stream: 'stdout', data: 'orphan' }]);
  });

  it('handles CRLF line endings', () => {
    const { frames, parse } = collect();
    parse('windows\r\nstyle\r\n');
    expect(frames).toEqual([
      { type: 'stream', stream: 'stdout', data: 'windows' },
      { type: 'stream', stream: 'stdout', data: 'style' },
    ]);
  });

  it('routes stderr-mode frames to stream:stderr', () => {
    const frames: Frame[] = [];
    const parser = createFrameParser((f) => frames.push(f), { stream: 'stderr' });
    parser.feed(Buffer.from('error message\n', 'utf-8'));
    expect(frames).toEqual([{ type: 'stream', stream: 'stderr', data: 'error message' }]);
  });

  // pwsh on alpine with PSReadLine 2.3.5 prefixes every Write-Host output
  // line with terminal cursor-mode escapes (DECCKM `[?1h` / `[?1l`)
  // when launched with `-NoExit -Command -` and a piped stdin. Without the
  // strip below, the framed startup-complete line never matches the
  // `__M_FRAME__` prefix and SessionManager.waitForReady times out at 10s.
  it('parses a framed line that is prefixed with ANSI cursor-mode escapes', () => {
    const { frames, parse } = collect();
    parse('[?1h[?1l[?1h__M_FRAME__{"type":"stream","stream":"info","data":"mockingbird-startup-complete"}\n');
    expect(frames).toEqual([
      { type: 'stream', stream: 'info', data: 'mockingbird-startup-complete' },
    ]);
  });

  it('parses a framed line that is prefixed with a CSI SGR escape (color reset)', () => {
    const { frames, parse } = collect();
    parse('[0m__M_FRAME__{"type":"runStarted","runId":"r2"}\n');
    expect(frames).toEqual([{ type: 'runStarted', runId: 'r2' }]);
  });

  it('preserves leading ANSI escapes when the line is plain stdout (not a frame)', () => {
    const { frames, parse } = collect();
    parse('[31mred text[0m\n');
    expect(frames).toEqual([{ type: 'stream', stream: 'stdout', data: '[31mred text[0m' }]);
  });
});
