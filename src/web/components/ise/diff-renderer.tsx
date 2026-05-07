import type { DiffPayload, AppliedPayload } from './frame-router';

export function DiffBlock({ payload }: { payload: DiffPayload }) {
  return (
    <div className="my-2 rounded border border-orange-500/40 bg-orange-50/10 p-3 font-mono text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-orange-300">DRY-RUN {payload.operation ? `: ${payload.operation}` : ''}</span>
        {payload.summary && <span className="text-muted-foreground">{payload.summary}</span>}
      </div>
      {payload.warnings.length > 0 && (
        <ul className="mb-2 list-disc pl-5 text-yellow-300">
          {payload.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      <pre className="whitespace-pre overflow-x-auto leading-tight">
        {payload.data.split('\n').map((line, i) => (
          <span key={i} className={
            line.startsWith('+') && !line.startsWith('+++') ? 'block text-green-400' :
            line.startsWith('-') && !line.startsWith('---') ? 'block text-red-400' :
            line.startsWith('@@') ? 'block text-cyan-400' :
            'block text-muted-foreground'
          }>
            {line || ' '}
          </span>
        ))}
      </pre>
    </div>
  );
}

export function AppliedBlock({ payload }: { payload: AppliedPayload }) {
  return (
    <div className="my-2 rounded border border-green-500/40 bg-green-50/10 p-3 font-mono text-xs">
      <span className="font-semibold text-green-300">APPLIED</span>
      <span className="ml-2 text-muted-foreground">{payload.writes} write{payload.writes === 1 ? '' : 's'}</span>
      <ul className="mt-1 list-disc pl-5">
        {payload.paths.map((p, i) => <li key={i} className="text-green-400">{p}</li>)}
      </ul>
    </div>
  );
}
