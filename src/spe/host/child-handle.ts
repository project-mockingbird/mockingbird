// src/spe/host/child-handle.ts
import { spawn, type ChildProcess } from 'child_process';
import type { Frame, FrameListener, IChildHandle } from './types.js';
import { createFrameParser } from './frame-parser.js';

export interface PwshChildHandleOptions {
  pwshPath: string;
  /** Inline PS code piped via -Command. Should set up Invoke-MockingbirdRun etc. */
  startupScript: string;
  /**
   * Extra env vars merged into the child's environment (on top of process.env).
   * Phase 3 uses this to inject MOCKINGBIRD_API_URL so cmdlets can call back
   * into the Mockingbird REST API on loopback.
   */
  env?: NodeJS.ProcessEnv;
}

export class PwshChildHandle implements IChildHandle {
  private proc: ChildProcess;
  private listeners: FrameListener[] = [];
  private _closed = false;

  constructor(opts: PwshChildHandleOptions) {
    this.proc = spawn(opts.pwshPath, ['-NoProfile', '-NoLogo', '-NoExit', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });

    const stdoutParser = createFrameParser((f) => this.dispatch(f));
    const stderrParser = createFrameParser((f) => this.dispatch(f), { stream: 'stderr' });
    this.proc.stdout!.on('data', (chunk: Buffer) => stdoutParser.feed(chunk));
    this.proc.stderr!.on('data', (chunk: Buffer) => stderrParser.feed(chunk));

    this.proc.on('exit', (code) => {
      stdoutParser.flush();
      stderrParser.flush();
      this._closed = true;
      this.dispatch({ type: 'sessionClosed', reason: code === 0 ? 'explicit' : 'crash' });
    });

    // Inject startup script via stdin (the `-Command -` flag reads from stdin).
    this.proc.stdin!.write(opts.startupScript);
  }

  writeLine(line: string): void {
    if (this._closed) throw new Error('child closed');
    this.proc.stdin!.write(line.endsWith('\n') ? line : line + '\n');
  }

  async abort(): Promise<void> {
    if (this._closed) return;
    if (process.platform === 'win32') {
      // No clean Ctrl-C primitive on Windows for detached processes; signal SIGINT.
      // Falls back to kill on timeout in the session manager.
      this.proc.kill('SIGINT');
    } else {
      this.proc.kill('SIGINT');
    }
  }

  async kill(): Promise<void> {
    if (this._closed) return;
    return new Promise<void>((resolve) => {
      this.proc.once('exit', () => resolve());
      this.proc.kill('SIGKILL');
    });
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  get closed(): boolean { return this._closed; }

  private dispatch(frame: Frame): void {
    for (const l of [...this.listeners]) l(frame);
  }
}
