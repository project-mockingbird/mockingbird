import { useEffect, useRef, useState, useCallback } from 'react';

export interface LogStreamOptions {
  /** Max entries to keep in memory. Defaults to 1000. */
  max?: number;
}

export interface LogStreamState<T> {
  entries: T[];
  connectionState: 'connecting' | 'open';
  reset: () => void;
}

interface IdShape { id: number }

/**
 * Subscribe to a Fastify SSE log endpoint. Handles replay-on-connect
 * and individual entry events. EventSource auto-reconnects and the
 * browser sets Last-Event-ID, so the server's getSince(id) returns
 * only newer entries on resume. Client-side dedup by id is defensive:
 * a server-side replay overlapping live entries seen pre-disconnect,
 * or any other reconnect edge case, would otherwise double-count.
 *
 * connectionState transitions: 'connecting' (initial AND every
 * post-error reconnect attempt), 'open' (on EventSource open event).
 * The hook does not distinguish transient retry from permanent
 * failure - consumers that want a "stream gave up" indicator need
 * to count error events themselves.
 */
export function useLogStream<T extends IdShape>(
  endpoint: string,
  options: LogStreamOptions = {},
): LogStreamState<T> {
  const max = options.max ?? 1000;
  const [entries, setEntries] = useState<T[]>([]);
  const [connectionState, setConnectionState] = useState<LogStreamState<T>['connectionState']>('connecting');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(endpoint);
    esRef.current = es;

    const onOpen = () => setConnectionState('open');
    const onError = () => setConnectionState('connecting');
    const onReplay = (e: MessageEvent) => {
      try {
        const batch = JSON.parse(e.data) as T[];
        setEntries((prev) => {
          const seen = new Set(prev.map(p => p.id));
          const merged = prev.concat(batch.filter(b => !seen.has(b.id)));
          return merged.length > max ? merged.slice(merged.length - max) : merged;
        });
      } catch { /* drop malformed replay */ }
    };
    const onEntry = (e: MessageEvent) => {
      try {
        const entry = JSON.parse(e.data) as T;
        setEntries((prev) => {
          if (prev.some(p => p.id === entry.id)) return prev;
          const next = prev.concat(entry);
          return next.length > max ? next.slice(next.length - max) : next;
        });
      } catch { /* drop malformed entry */ }
    };

    es.addEventListener('open', onOpen);
    es.addEventListener('error', onError);
    es.addEventListener('replay', onReplay as EventListener);
    es.addEventListener('entry', onEntry as EventListener);

    return () => {
      es.removeEventListener('open', onOpen);
      es.removeEventListener('error', onError);
      es.removeEventListener('replay', onReplay as EventListener);
      es.removeEventListener('entry', onEntry as EventListener);
      es.close();
      // No setConnectionState('closed') here: on unmount the setter
      // is a no-op, and on endpoint change the next effect run
      // immediately re-opens, so flashing 'closed' between the two
      // would just be wrong UI.
    };
  }, [endpoint, max]);

  const reset = useCallback(() => setEntries([]), []);

  return { entries, connectionState, reset };
}
