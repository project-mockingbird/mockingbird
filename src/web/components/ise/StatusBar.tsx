import { useEffect, useState } from 'react';

interface StatusBarProps {
  status: 'connecting' | 'ready' | 'running' | 'aborted' | 'error' | 'closed';
  runDurationMs?: number;
  expiresAt: string | null;
  cursor?: { line: number; column: number };
}

const STATUS_LABELS: Record<StatusBarProps['status'], string> = {
  connecting: 'Connecting...',
  ready: 'Ready',
  running: 'Running',
  aborted: 'Aborted',
  error: 'Error',
  closed: 'Closed',
};

export function StatusBar({ status, runDurationMs, expiresAt, cursor }: StatusBarProps) {
  // Tick once per minute so the "expires in Nm" text counts down without
  // waiting for an unrelated parent rerender. Skipped when there's no
  // expiresAt to display.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const statusText = status === 'running' && runDurationMs
    ? `Running (${Math.round(runDurationMs / 1000)}s)`
    : STATUS_LABELS[status];

  let expiryText: string | null = null;
  if (expiresAt) {
    const remainMs = new Date(expiresAt).getTime() - Date.now();
    if (remainMs > 0) {
      const min = Math.round(remainMs / 60_000);
      expiryText = `Idle - session expires in ${min}m`;
    }
  }

  return (
    <div className="flex h-6 items-center justify-between border-t bg-card px-3 text-xs text-muted-foreground">
      <div className="flex gap-4">
        <span>{statusText}</span>
        {expiryText && <span>{expiryText}</span>}
      </div>
      {cursor && (
        <div className="flex gap-3">
          <span>Ln {cursor.line} Col {cursor.column}</span>
        </div>
      )}
    </div>
  );
}
