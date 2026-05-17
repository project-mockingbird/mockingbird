// Client-side mirror of `src/spe/host/types.ts` Frame union.
// Kept separate so the web bundle does not reach into Node-only code.
// If the server adds a frame type, this file must be updated to match.

export type StreamKind = 'stdout' | 'stderr' | 'info' | 'warning' | 'error' | 'verbose';

export type Frame =
  | { type: 'stream'; stream: StreamKind; data: string }
  | { type: 'runStarted'; runId: string }
  | { type: 'runComplete'; runId: string; exitCode: number; durationMs: number }
  | { type: 'runAborted'; runId: string }
  | { type: 'sessionExpiring'; expiresAt: string }
  | { type: 'sessionClosed'; reason: 'ttl' | 'explicit' | 'crash' }
  | { type: 'diff'; format: 'unified'; operation?: string; summary?: string; warnings?: string[]; data: string }
  | { type: 'applied'; summary: { writes: number; paths: string[] } }
  | { type: 'clear' };
