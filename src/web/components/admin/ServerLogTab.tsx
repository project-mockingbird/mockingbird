import { useState, useMemo } from 'react';
import { useLogStream } from '@/hooks/useLogStream';
import { LogRow } from './LogRow';

interface ServerLogEntry {
  id: number;
  ts: number;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  msg: string;
  method?: string;
  url?: string;
  statusCode?: number;
  durationMs?: number;
  requestId?: string;
  raw: string;
}

const LEVEL_OPTIONS: ServerLogEntry['level'][] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

function levelAtLeast(entryLevel: ServerLogEntry['level'], min: ServerLogEntry['level'] | 'all'): boolean {
  if (min === 'all') return true;
  return LEVEL_OPTIONS.indexOf(entryLevel) >= LEVEL_OPTIONS.indexOf(min);
}

export function ServerLogTab() {
  const { entries } = useLogStream<ServerLogEntry>('/api/admin/logs/server/stream');
  const [level, setLevel] = useState<'all' | ServerLogEntry['level']>('all');
  const [text, setText] = useState('');

  const filtered = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return entries.filter(e => {
      if (!levelAtLeast(e.level, level)) return false;
      if (!needle) return true;
      return (
        e.msg.toLowerCase().includes(needle) ||
        (e.url ?? '').toLowerCase().includes(needle) ||
        (e.method ?? '').toLowerCase().includes(needle) ||
        (e.requestId ?? '').toLowerCase().includes(needle)
      );
    });
  }, [entries, level, text]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-2 border-b bg-card">
        <label className="flex items-center gap-2 text-sm">
          <span>Level</span>
          <select
            aria-label="level"
            className="border rounded px-2 py-1 bg-background"
            value={level}
            onChange={(e) => setLevel(e.target.value as 'all' | ServerLogEntry['level'])}
          >
            <option value="all">all</option>
            {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}+</option>)}
          </select>
        </label>
        <input
          type="search"
          placeholder="Search"
          className="flex-1 border rounded px-2 py-1 bg-background text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} / {entries.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map(e => (
          <LogRow
            key={e.id}
            ts={e.ts}
            level={e.level}
            primary={e.url ? `${e.method ?? ''} ${e.url}`.trim() : e.msg}
            secondary={e.statusCode ? `${e.statusCode} ${e.durationMs ?? '-'}ms` : undefined}
          />
        ))}
      </div>
    </div>
  );
}
