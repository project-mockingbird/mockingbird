import type { Frame, StreamKind } from './frame-types';

export interface DiffPayload {
  operation?: string;
  summary?: string;
  warnings: string[];
  data: string;
}

export interface AppliedPayload {
  writes: number;
  paths: string[];
}

export interface FrameRouterTargets {
  onTerminalWrite: (stream: StreamKind, ansi: string) => void;
  onDiff: (payload: DiffPayload) => void;
  onApplied: (payload: AppliedPayload) => void;
  onRunStarted: (runId: string) => void;
  onRunComplete: (runId: string, exitCode: number, durationMs: number) => void;
  onRunAborted: (runId: string) => void;
  onSessionExpiring: (expiresAt: string) => void;
  onSessionClosed: (reason: 'ttl' | 'explicit' | 'crash') => void;
  onClear: () => void;
}

const ANSI_RESET = '\x1b[0m';
const ANSI_RED = '\x1b[31m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_GREY = '\x1b[90m';

function colorize(stream: StreamKind, data: string): string {
  switch (stream) {
    case 'error':   return `${ANSI_RED}${data}${ANSI_RESET}`;
    case 'warning': return `${ANSI_YELLOW}${data}${ANSI_RESET}`;
    case 'info':    return `${ANSI_CYAN}${data}${ANSI_RESET}`;
    case 'verbose': return `${ANSI_GREY}${data}${ANSI_RESET}`;
    case 'stderr':  return `${ANSI_RED}${data}${ANSI_RESET}`;
    case 'stdout':  return data;
  }
}

export function routeFrame(frame: Frame, targets: FrameRouterTargets): void {
  switch (frame.type) {
    case 'stream':
      targets.onTerminalWrite(frame.stream, colorize(frame.stream, frame.data));
      return;
    case 'diff':
      targets.onDiff({
        operation: frame.operation,
        summary: frame.summary,
        warnings: frame.warnings ?? [],
        data: frame.data,
      });
      return;
    case 'applied':
      targets.onApplied(frame.summary);
      return;
    case 'runStarted':
      targets.onRunStarted(frame.runId);
      return;
    case 'runComplete':
      targets.onRunComplete(frame.runId, frame.exitCode, frame.durationMs);
      return;
    case 'runAborted':
      targets.onRunAborted(frame.runId);
      return;
    case 'sessionExpiring':
      targets.onSessionExpiring(frame.expiresAt);
      return;
    case 'sessionClosed':
      targets.onSessionClosed(frame.reason);
      return;
    case 'clear':
      targets.onClear();
      return;
    default: {
      // Exhaustiveness check: adding a new Frame variant must be handled above
      // or this will be a compile error.
      const _exhaustive: never = frame;
      void _exhaustive;
    }
  }
}
