import { useState, useMemo } from 'react';
import { useLogStream } from '@/hooks/useLogStream';
import { LogRow } from './LogRow';

interface GraphqlLogEntry {
  id: number;
  ts: number;
  requestId: string;
  operationName: string | null;
  operationType: 'query' | 'mutation' | 'subscription' | null;
  statusCode: number;
  durationMs: number;
  request: { query: string; variables: unknown; truncated: boolean } | null;
  response: { body: string; truncated: boolean } | null;
  errorCount: number;
  firstError: string | null;
  captureError?: string;
}

function prettyJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function prettyResponseBody(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
}

function buildCurl(entry: GraphqlLogEntry, endpoint: string): string {
  const payload = {
    query: entry.request?.query ?? '',
    variables: entry.request?.variables ?? {},
    operationName: entry.operationName,
  };
  return `curl -X POST -H "Content-Type: application/json" --data ${JSON.stringify(JSON.stringify(payload))} ${endpoint}`;
}

const OP_CHIP: Record<NonNullable<GraphqlLogEntry['operationType']>, string> = {
  query: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  mutation: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  subscription: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
};

export function GraphqlLogTab() {
  const { entries } = useLogStream<GraphqlLogEntry>('/api/admin/logs/graphql/stream');
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(e =>
      (e.operationName ?? '').toLowerCase().includes(needle) ||
      (e.request?.query ?? '').toLowerCase().includes(needle) ||
      (e.firstError ?? '').toLowerCase().includes(needle) ||
      e.requestId.toLowerCase().includes(needle)
    );
  }, [entries, text]);

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-2 border-b bg-card">
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
        {filtered.map(e => {
          const opType = e.operationType;
          const chip = opType ? <span className={`px-1.5 py-0 text-xs rounded uppercase ${OP_CHIP[opType]}`}>{opType}</span> : null;
          const opName = e.operationName ?? '(anonymous)';
          const errSuffix = e.errorCount > 0
            ? ` | ${e.errorCount} error${e.errorCount === 1 ? '' : 's'}: ${e.firstError ?? ''}`
            : '';
          const primary = (
            <span className="flex items-center gap-2">
              {chip}
              <span>{opName}</span>
            </span>
          );
          const secondary = `${e.statusCode} ${e.durationMs}ms${errSuffix}`;
          const isExpanded = expanded.has(e.id);
          const detail = (
            <div className="space-y-2 text-xs">
              {e.captureError ? (
                <div className="text-destructive">capture error: {e.captureError}</div>
              ) : null}
              {e.request ? (
                <div>
                  <div className="text-muted-foreground mb-1">Request</div>
                  <pre className="whitespace-pre-wrap break-all bg-background border rounded p-2 max-h-64 overflow-auto">{e.request.query}</pre>
                  <div className="text-muted-foreground mt-2 mb-1">Variables</div>
                  <pre className="whitespace-pre-wrap break-all bg-background border rounded p-2 max-h-32 overflow-auto">{prettyJson(e.request.variables)}</pre>
                  {e.request.truncated ? <div className="text-yellow-600 dark:text-yellow-400 mt-1">Body truncated. Use the curl below to fetch the full response.</div> : null}
                </div>
              ) : null}
              {e.response ? (
                <div>
                  <div className="text-muted-foreground mb-1">Response</div>
                  <pre className="whitespace-pre-wrap break-all bg-background border rounded p-2 max-h-64 overflow-auto">{prettyResponseBody(e.response.body)}</pre>
                  {e.response.truncated ? <div className="text-yellow-600 dark:text-yellow-400 mt-1">Body truncated.</div> : null}
                </div>
              ) : null}
              <div className="pt-1">
                <button
                  type="button"
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void navigator.clipboard.writeText(buildCurl(e, '/api/graphql'));
                  }}
                >
                  Copy as curl
                </button>
              </div>
            </div>
          );
          return (
            <LogRow
              key={e.id}
              ts={e.ts}
              primary={primary}
              secondary={secondary}
              detail={detail}
              expanded={isExpanded}
              onToggleExpanded={() => toggle(e.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
