/**
 * Minimal phase-timing helper for the indexer. Emits a single line per
 * completed phase so perf regressions and cold/warm-path breakdowns are
 * legible from container logs. No structured export - grep `[index]` to
 * see the sequence.
 *
 * Added 0.4.0.20+ as groundwork for the indexing-perf investigation: the
 * full index rebuild takes 5-10 minutes on the user's Windows bind-mount
 * and we have no data on which sub-phase dominates. Lines emitted here
 * answer that.
 */

export interface PhaseTimer {
  /**
   * Log the phase's completion with its duration, plus any `extras` as
   * `k=v` pairs appended after a middle dot.
   */
  end(extras?: Record<string, string | number>): number;
}

export interface PhaseTiming {
  label: string;
  durationMs: number;
  extras?: Record<string, string | number>;
}

const _timings: PhaseTiming[] = [];

/**
 * Returns a frozen snapshot of phases captured so far in this process. The
 * snapshot is a defensive copy: callers can read but not mutate it. The list
 * grows monotonically across boot until cleared. Exposed so /api/status can
 * surface a structured boot timeline alongside the existing stderr emission.
 */
export function getPhaseTimings(): readonly PhaseTiming[] {
  return Object.freeze(_timings.slice());
}

/** Empties the captured-timings list. Used by tests and would be used if we
 *  ever wanted to re-capture across a hot reload. */
export function clearPhaseTimings(): void {
  _timings.length = 0;
}

export function startPhase(label: string): PhaseTimer {
  const t0 = process.hrtime.bigint();
  return {
    end(extras) {
      const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
      _timings.push(
        extras !== undefined
          ? { label, durationMs: ms, extras }
          : { label, durationMs: ms },
      );
      const extraStr = extras
        ? ' · ' + Object.entries(extras).map(([k, v]) => `${k}=${v}`).join(' ')
        : '';
      // stderr, not stdout - CLI commands like `scp validate --format json`
      // pipe program output on stdout and must stay clean.
      console.error(`  [index] ${label} → ${formatDuration(ms)}${extraStr}`);
      return ms;
    },
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(1);
  return `${mins}m${secs}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
