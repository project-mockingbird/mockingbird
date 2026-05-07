// src/spe/host/session-manager.ts
import { randomUUID } from 'crypto';
import type {
  ExecuteOptions,
  ExecuteResult,
  Frame,
  FrameListener,
  IChildHandle,
  SessionId,
  SessionInfo,
  SessionManagerOptions,
} from './types.js';
import { PwshChildHandle } from './child-handle.js';
import { STARTUP_SCRIPT_LEGACY, buildStartupScript } from './startup-template.js';

interface SessionEntry {
  sessionId: SessionId;
  child: IChildHandle;
  createdAt: number;
  expiresAt: number;
  idleTimer: NodeJS.Timeout;
  activeRunId: string | null;
  /** Listeners forwarded to anyone subscribed via subscribe(). */
  externalListeners: FrameListener[];
  /** Recent frames (capped) for WS reconnect replay. */
  frameBuffer: Frame[];
  /** True between abort() invocation and the resulting child close. Used to
   *  translate a Windows-side "child died from SIGINT" crash into an explicit
   *  abort + close pair so callers don't see a phantom sessionClosed/crash. */
  aborting: boolean;
}

const FRAME_BUFFER_CAP = 200;

/**
 * Public snapshot of the SPE host's eager-warmup state. Used by /api/status
 * to expose `speState` as an axis independent of `state:"ready"` (content
 * surface readiness). Allows browser/SPA gates and consumer probes to wait
 * on SPE specifically without coupling to GraphQL/REST availability.
 */
export interface SessionManagerStateSnapshot {
  state: 'starting' | 'ready' | 'error';
  error: string | null;
  startedAt: number | null;
  readyAt: number | null;
}

export class SessionManager {
  private readonly sessions = new Map<SessionId, SessionEntry>();
  private readonly opts: Required<Omit<SessionManagerOptions, 'childHandleFactory'>> & {
    childHandleFactory: NonNullable<SessionManagerOptions['childHandleFactory']>;
  };
  // Eager-warmup state machine. Defaults to 'ready' so deployments that
  // never call warmup() retain legacy on-demand behavior (every POST
  // /api/spe/sessions spawns fresh, route returns 201). Calling warmup()
  // flips to 'starting' synchronously on entry, then to 'ready' (or
  // 'error') when the primer settles. Routes gate 425 Too Early on
  // 'starting'.
  private _state: 'starting' | 'ready' | 'error' = 'ready';
  private _warmupError: string | null = null;
  private _startedAt: number | null = null;
  private _readyAt: number | null = null;
  // sessionId of the warmed-up primer child. Cleared on first claim.
  private _primerId: SessionId | null = null;

  constructor(opts: SessionManagerOptions = {}) {
    this.opts = {
      sessionTtlMin: opts.sessionTtlMin ?? 30,
      maxSessions: opts.maxSessions ?? 8,
      pwshPath: opts.pwshPath ?? 'pwsh',
      childHandleFactory: opts.childHandleFactory ?? ((o) => new PwshChildHandle(o)),
      providerDllPath: opts.providerDllPath ?? '',
      moduleManifestPath: opts.moduleManifestPath ?? '',
      apiUrl: opts.apiUrl ?? 'http://127.0.0.1:3000',
    };
  }

  get state(): SessionManagerStateSnapshot {
    return {
      state: this._state,
      error: this._warmupError,
      startedAt: this._startedAt,
      readyAt: this._readyAt,
    };
  }

  /**
   * Eagerly spawns one pwsh child at server start so the first POST
   * /api/spe/sessions can claim it instead of paying full spawn cost
   * (cold pwsh + .NET + DLL load is 10-30s on Docker Desktop). Never
   * throws - failures are captured into state for /api/status to expose.
   */
  async warmup(): Promise<void> {
    if (this._startedAt !== null) return; // idempotent
    this._startedAt = Date.now();
    this._state = 'starting';
    try {
      const info = await this._spawnFresh();
      this._primerId = info.sessionId;
      this._readyAt = Date.now();
      this._state = 'ready';
    } catch (err) {
      this._warmupError = err instanceof Error ? err.message : String(err);
      this._state = 'error';
    }
  }

  async create(): Promise<SessionInfo> {
    // Claim the warmed-up primer if it's still alive. The primer is a
    // regular session (already in `sessions`); claiming just hands its
    // id to the caller and clears _primerId so it isn't claimed twice.
    if (this._primerId !== null) {
      const primerId = this._primerId;
      this._primerId = null;
      const entry = this.sessions.get(primerId);
      if (entry) {
        return {
          sessionId: primerId,
          expiresAt: new Date(entry.expiresAt).toISOString(),
          createdAt: new Date(entry.createdAt).toISOString(),
        };
      }
      // Primer was disposed (TTL or crash) before claim - fall through to
      // spawn fresh.
    }
    return this._spawnFresh();
  }

  private async _spawnFresh(): Promise<SessionInfo> {
    // TOCTOU fix: synchronously reserve a slot in the map BEFORE we await on
    // child startup. Otherwise two near-simultaneous create() calls could both
    // pass the size check and over-fill the cap. We insert with a placeholder
    // entry and swap in the real one once the child reports ready.
    if (this.sessions.size >= this.opts.maxSessions) {
      throw new Error(`max sessions (${this.opts.maxSessions}) reached; try again later`);
    }
    const sessionId = randomUUID();
    // When a provider DLL path is configured, load the real Phase 3 cmdlets;
    // otherwise fall back to the Phase 2 baseline so existing mocked tests
    // (which don't depend on cmdlets) keep passing.
    const startupScript = this.opts.providerDllPath
      ? buildStartupScript({
          providerDllPath: this.opts.providerDllPath,
          moduleManifestPath: this.opts.moduleManifestPath,
        })
      : STARTUP_SCRIPT_LEGACY;
    const child = this.opts.childHandleFactory({
      pwshPath: this.opts.pwshPath,
      startupScript,
      env: { MOCKINGBIRD_API_URL: this.opts.apiUrl },
    });
    const now = Date.now();
    const ttlMs = this.opts.sessionTtlMin * 60_000;
    const entry: SessionEntry = {
      sessionId,
      child,
      createdAt: now,
      expiresAt: now + ttlMs,
      idleTimer: setTimeout(() => this.dispose(sessionId, 'ttl'), ttlMs),
      activeRunId: null,
      externalListeners: [],
      frameBuffer: [],
      aborting: false,
    };
    // Reserve the slot synchronously - now no other create() call can pass the
    // size check until either we succeed or we fail-and-cleanup below.
    this.sessions.set(sessionId, entry);

    child.onFrame((frame) => this.handleFrame(sessionId, frame));

    try {
      // Wait for the child's startup-complete signal.
      await this.waitForReady(sessionId);
    } catch (err) {
      // Startup failed: undo our slot reservation and tear down the child.
      clearTimeout(entry.idleTimer);
      this.sessions.delete(sessionId);
      if (!entry.child.closed) await entry.child.kill().catch(() => {});
      throw err;
    }

    return {
      sessionId,
      expiresAt: new Date(entry.expiresAt).toISOString(),
      createdAt: new Date(entry.createdAt).toISOString(),
    };
  }

  get(sessionId: SessionId): SessionEntry | null {
    return this.sessions.get(sessionId) ?? null;
  }

  execute(sessionId: SessionId, opts: ExecuteOptions): ExecuteResult | { error: 'session-not-found' | 'run-active' } {
    const entry = this.sessions.get(sessionId);
    if (!entry) return { error: 'session-not-found' };
    if (entry.activeRunId) return { error: 'run-active' };

    const runId = randomUUID();
    entry.activeRunId = runId;
    this.resetIdleTimer(entry);

    // pwsh -Command - reads stdin line-by-line and only executes when a command
    // is syntactically complete on a single read. Multi-line user scripts wrapped
    // in { ... } don't reliably parse - the inner newlines confuse the line-by-line
    // reader and the run never starts. Base64-encode the script so the wrapper
    // command stays on a single line; iex decodes and runs the multi-line body
    // inside pwsh's native parser.
    const apply = opts.applyMode ? '$true' : '$false';
    const b64 = Buffer.from(opts.script, 'utf-8').toString('base64');
    const command = `Invoke-MockingbirdRun -RunId '${runId}' -ApplyMode ${apply} { Invoke-Expression ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'))) }`;
    entry.child.writeLine(command);

    return { runId };
  }

  async abort(sessionId: SessionId): Promise<boolean> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    if (!entry.activeRunId) return false;
    // Mark the session so the inevitable child close after SIGINT is read as
    // an explicit abort, not a crash. On Linux the PS-side catch fires first
    // and emits runAborted; the child stays alive and aborting flips back.
    // On Windows the child dies; handleFrame() sees sessionClosed/crash and
    // rewrites it to sessionClosed/explicit + synthesizes a runAborted frame.
    entry.aborting = true;
    await entry.child.abort();
    return true;
  }

  async dispose(sessionId: SessionId, reason: 'ttl' | 'explicit' | 'crash'): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    clearTimeout(entry.idleTimer);
    this.sessions.delete(sessionId);
    this.dispatchToListeners(entry, { type: 'sessionClosed', reason });
    if (!entry.child.closed) await entry.child.kill();
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map(id => this.dispose(id, 'explicit')));
  }

  /** Subscribe to a session's frame stream. Returns unsubscribe + the recent buffer for replay. */
  subscribe(sessionId: SessionId, listener: FrameListener): { unsubscribe: () => void; replay: Frame[] } | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    entry.externalListeners.push(listener);
    return {
      unsubscribe: () => { entry.externalListeners = entry.externalListeners.filter(l => l !== listener); },
      replay: [...entry.frameBuffer],
    };
  }

  private handleFrame(sessionId: SessionId, frame: Frame): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    // Buffer for replay - skip the internal startup-complete handshake so WS
    // clients connecting later don't see a synthetic info frame in their replay.
    const isStartupHandshake =
      frame.type === 'stream' &&
      frame.stream === 'info' &&
      frame.data === 'mockingbird-startup-complete';
    if (!isStartupHandshake) {
      entry.frameBuffer.push(frame);
      if (entry.frameBuffer.length > FRAME_BUFFER_CAP) entry.frameBuffer.shift();
    }

    // Track run lifecycle
    if (frame.type === 'runComplete' || frame.type === 'runAborted') {
      entry.activeRunId = null;
      entry.aborting = false;
    }

    // Crash detection
    if (frame.type === 'sessionClosed' && frame.reason === 'crash') {
      // If we initiated the abort, this is the Windows path: process.kill('SIGINT')
      // terminated the child rather than interrupting the pipeline. Synthesize a
      // runAborted (so the UI sees the abort it asked for) and rewrite the close
      // reason to 'explicit' so listeners don't think the session crashed.
      if (entry.aborting && entry.activeRunId) {
        const runId = entry.activeRunId;
        entry.activeRunId = null;
        entry.aborting = false;
        const synthetic: Frame = { type: 'runAborted', runId };
        entry.frameBuffer.push(synthetic);
        if (entry.frameBuffer.length > FRAME_BUFFER_CAP) entry.frameBuffer.shift();
        this.dispatchToListeners(entry, synthetic);
        // Rewrite this sessionClosed frame's reason for downstream listeners.
        frame = { ...frame, reason: 'explicit' };
      }
      // Child reported its own death; remove from map, but don't double-dispose.
      clearTimeout(entry.idleTimer);
      this.sessions.delete(sessionId);
    }

    this.dispatchToListeners(entry, frame);
  }

  private dispatchToListeners(entry: SessionEntry, frame: Frame): void {
    for (const l of [...entry.externalListeners]) l(frame);
  }

  private resetIdleTimer(entry: SessionEntry): void {
    clearTimeout(entry.idleTimer);
    const ttlMs = this.opts.sessionTtlMin * 60_000;
    entry.expiresAt = Date.now() + ttlMs;
    entry.idleTimer = setTimeout(() => this.dispose(entry.sessionId, 'ttl'), ttlMs);
  }

  private async waitForReady(sessionId: SessionId): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`session ${sessionId} vanished during startup`);
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error('pwsh startup did not signal ready within 10s'));
      }, 10_000);
      const unsub = entry.child.onFrame((frame) => {
        if (frame.type === 'stream' && frame.stream === 'info' && frame.data === 'mockingbird-startup-complete') {
          clearTimeout(timeout);
          unsub();
          resolve();
        }
      });
    });
  }
}
