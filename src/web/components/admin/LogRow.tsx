import type { ReactNode } from 'react';

export interface LogRowProps {
  ts: number;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  primary: ReactNode;     // method+url, or operation name
  secondary?: ReactNode;  // status / duration / error count
  detail?: ReactNode;     // expandable body block
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

const LEVEL_CHIP: Record<NonNullable<LogRowProps['level']>, string> = {
  trace: 'bg-muted text-muted-foreground',
  debug: 'bg-muted text-muted-foreground',
  info: 'bg-primary/15 text-primary',
  warn: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  error: 'bg-destructive/20 text-destructive',
  fatal: 'bg-destructive text-destructive-foreground',
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function LogRow({ ts, level, primary, secondary, detail, expanded, onToggleExpanded }: LogRowProps) {
  const isToggleable = !!detail;
  return (
    <div className="border-b text-sm font-mono">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-1 text-left hover:bg-accent/30 disabled:cursor-default"
        onClick={onToggleExpanded}
        disabled={!isToggleable}
        aria-expanded={isToggleable ? !!expanded : undefined}
      >
        <span className="text-muted-foreground tabular-nums">{fmtTime(ts)}</span>
        {level ? (
          <span className={`px-1.5 py-0 text-xs rounded uppercase ${LEVEL_CHIP[level]}`}>{level}</span>
        ) : null}
        <span className="flex-1 truncate">{primary}</span>
        {secondary ? <span className="text-muted-foreground whitespace-nowrap">{secondary}</span> : null}
      </button>
      {isToggleable && expanded ? (
        <div className="px-3 py-2 bg-muted/40 border-t">{detail}</div>
      ) : null}
    </div>
  );
}
