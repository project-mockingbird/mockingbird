// src/spe/host/types.ts

export type SessionId = string;
export type RunId = string;
export type FrameToken = symbol;

export type StreamKind = 'stdout' | 'stderr' | 'info' | 'warning' | 'error' | 'verbose';

export type Frame =
  | { type: 'stream'; stream: StreamKind; data: string }
  | { type: 'runStarted'; runId: RunId }
  | { type: 'runComplete'; runId: RunId; exitCode: number; durationMs: number }
  | { type: 'runAborted'; runId: RunId }
  | { type: 'sessionExpiring'; expiresAt: string }
  | { type: 'sessionClosed'; reason: 'ttl' | 'explicit' | 'crash' };

export type FrameListener = (frame: Frame) => void;

export interface IChildHandle {
  /** Write a chunk to the child's stdin. Newline appended automatically. */
  writeLine(line: string): void;
  /** Send abort signal (Ctrl-C on POSIX, GenerateConsoleCtrlEvent on Windows). */
  abort(): Promise<void>;
  /** Force-kill and dispose. Resolves when the process is gone. */
  kill(): Promise<void>;
  /** Subscribe to parsed frames. Returns an unsubscribe function. */
  onFrame(listener: FrameListener): () => void;
  /** True if the child has exited (any reason). */
  readonly closed: boolean;
}

export interface SessionManagerOptions {
  /** Idle TTL in minutes before a session is auto-evicted. Default 30. */
  sessionTtlMin?: number;
  /** Max concurrent sessions. New session creation past this returns null. Default 8. */
  maxSessions?: number;
  /** Override `pwsh` binary path. Default `'pwsh'` (resolved via PATH). */
  pwshPath?: string;
  /** Hook for tests: factory for `IChildHandle` instances. Default spawns real pwsh. */
  childHandleFactory?: (opts: { pwshPath: string; startupScript: string; env?: NodeJS.ProcessEnv }) => IChildHandle;
  /**
   * Absolute path to data/spe/Mockingbird.Provider.dll. Required for Phase 3+
   * cmdlets. When omitted, the legacy Phase 2 startup script (Echo-Test only)
   * is used so existing mocked tests still work.
   */
  providerDllPath?: string;
  /** Absolute path to src/spe/module/Mockingbird.psd1. Pairs with providerDllPath. */
  moduleManifestPath?: string;
  /**
   * API base URL passed to the child via the MOCKINGBIRD_API_URL env var so
   * cmdlets know where to call back into Mockingbird's REST surface. Default
   * 'http://127.0.0.1:3000'.
   */
  apiUrl?: string;
}

export interface SessionInfo {
  sessionId: SessionId;
  expiresAt: string; // ISO timestamp
  createdAt: string;
}

export interface ExecuteOptions {
  script: string;
  applyMode: boolean;
}

export interface ExecuteResult {
  runId: RunId;
}
