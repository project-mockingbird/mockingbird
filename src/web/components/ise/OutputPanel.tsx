import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { routeFrame, type DiffPayload, type AppliedPayload } from './frame-router';
import { DiffBlock, AppliedBlock } from './diff-renderer';
import type { Frame } from './frame-types';

interface OutputPanelProps {
  frames: Frame[];
}

interface InlineBlock {
  id: number;
  kind: 'diff' | 'applied';
  payload: DiffPayload | AppliedPayload;
}

export function OutputPanel({ frames }: OutputPanelProps) {
  const xtermRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);
  const blockIdRef = useRef(0);
  const [blocks, setBlocks] = useState<InlineBlock[]>([]);

  // Mount the terminal
  useEffect(() => {
    if (!xtermRef.current) return;
    const term = new Terminal({
      convertEol: true,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      theme: { background: '#0a1428', foreground: '#cccccc' },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(xtermRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const resizeObs = new ResizeObserver(() => fit.fit());
    resizeObs.observe(xtermRef.current);

    return () => {
      resizeObs.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // Drain any new frames into the terminal / blocks
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    while (writtenRef.current < frames.length) {
      const frame = frames[writtenRef.current];
      writtenRef.current++;
      routeFrame(frame, {
        // The frame parser splits the child's stdout on \n and strips the
        // trailing \r before emitting; each Write-Host call therefore arrives
        // as one frame with no terminator. Use writeln so xterm renders each
        // frame on its own line (matches SPE's per-line output behavior).
        onTerminalWrite: (_stream, ansi) => term.writeln(ansi.replace(/\n/g, '\r\n')),
        onDiff: (p) => setBlocks((prev) => [...prev, { id: blockIdRef.current++, kind: 'diff', payload: p }]),
        onApplied: (p) => setBlocks((prev) => [...prev, { id: blockIdRef.current++, kind: 'applied', payload: p }]),
        onRunStarted: (runId) => term.writeln(`\x1b[36m> Run ${runId} started\x1b[0m`),
        onRunComplete: (runId, code, ms) => term.writeln(`\x1b[36m< Run ${runId} complete (exit ${code}, ${ms}ms)\x1b[0m`),
        onRunAborted: (runId) => term.writeln(`\x1b[33m< Run ${runId} aborted\x1b[0m`),
        onSessionExpiring: () => term.writeln('\x1b[33m! Session expires in 5min\x1b[0m'),
        onSessionClosed: (reason) => term.writeln(`\x1b[31m! Session closed (${reason})\x1b[0m`),
      });
    }
  }, [frames]);

  return (
    <div className="flex flex-col h-full bg-[#0a1428]">
      {blocks.length > 0 && (
        <div className="max-h-1/3 overflow-y-auto border-b border-border px-3 py-1">
          {blocks.map(b =>
            b.kind === 'diff'
              ? <DiffBlock key={b.id} payload={b.payload as DiffPayload} />
              : <AppliedBlock key={b.id} payload={b.payload as AppliedPayload} />
          )}
        </div>
      )}
      <div ref={xtermRef} className="flex-1 min-h-0 p-2" />
    </div>
  );
}
