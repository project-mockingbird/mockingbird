import { useEffect, useRef, useState, useCallback } from 'react';
import type { Frame } from './frame-types';

export interface UseSessionOpts {
  apiBase?: string; // defaults to ''
}

export type SessionStatus = 'connecting' | 'ready' | 'running' | 'aborted' | 'error' | 'closed';

export interface SessionState {
  sessionId: string | null;
  expiresAt: string | null;
  status: SessionStatus;
  error: string | null;
  frames: Frame[];
  execute: (script: string, applyMode: boolean) => Promise<string | null>;
  abort: () => Promise<void>;
}

export function useSession(opts: UseSessionOpts = {}): SessionState {
  const apiBase = opts.apiBase ?? '';
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const disposedRef = useRef(false);

  // Mount: create session + open WS
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/spe/sessions`, { method: 'POST' });
        if (!res.ok) throw new Error(`POST sessions returned ${res.status}`);
        const body = await res.json() as { sessionId: string; expiresAt: string };
        if (cancelled) return;
        sessionIdRef.current = body.sessionId;
        setSessionId(body.sessionId);
        setExpiresAt(body.expiresAt);
        const wsUrl = wsUrlFor(apiBase, body.sessionId);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => setStatus('ready');
        ws.onmessage = (ev: MessageEvent) => {
          try {
            const frame = JSON.parse(ev.data) as Frame;
            setFrames((prev) => [...prev, frame]);
            if (frame.type === 'runStarted') setStatus('running');
            // runComplete with non-zero exit is a per-script failure, not a
            // session failure. Status returns to 'ready' so the user can fix
            // and re-run. The 'error' status is reserved for transport / session
            // failures (WebSocket close, session crash, max-sessions reached).
            if (frame.type === 'runComplete') setStatus('ready');
            if (frame.type === 'runAborted') setStatus('ready');
            if (frame.type === 'sessionClosed') setStatus('closed');
          } catch {
            // Frame parse error - skip
          }
        };
        ws.onerror = () => setError('WebSocket error');
        ws.onclose = () => { if (!disposedRef.current) setStatus('closed'); };
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      disposedRef.current = true;
      const ws = wsRef.current;
      if (ws && ws.readyState <= 1) ws.close();
      const sid = sessionIdRef.current;
      if (sid) {
        fetch(`${apiBase}/api/spe/sessions/${sid}`, { method: 'DELETE' }).catch(() => {});
      }
    };
  }, [apiBase]);

  const execute = useCallback(async (script: string, applyMode: boolean): Promise<string | null> => {
    const sid = sessionIdRef.current;
    if (!sid) return null;
    const res = await fetch(`${apiBase}/api/spe/sessions/${sid}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script, applyMode }),
    });
    if (res.status === 409) {
      setError('A run is already active');
      return null;
    }
    if (!res.ok) {
      setError(`execute returned ${res.status}`);
      return null;
    }
    const body = await res.json() as { runId: string };
    return body.runId;
  }, [apiBase]);

  const abort = useCallback(async (): Promise<void> => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await fetch(`${apiBase}/api/spe/sessions/${sid}/abort`, { method: 'POST' });
  }, [apiBase]);

  return { sessionId, expiresAt, status, error, frames, execute, abort };
}

function wsUrlFor(apiBase: string, sessionId: string): string {
  const base = apiBase || window.location.origin;
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/api/spe/sessions/${sessionId}/stream`;
  return url.toString();
}
