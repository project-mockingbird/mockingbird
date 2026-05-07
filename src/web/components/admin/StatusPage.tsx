import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useEngineStatus, type EngineStatus } from '@/hooks/useEngineStatus';

type BadgeColor = 'success' | 'warning' | 'danger' | 'neutral';

function engineStateColor(state?: EngineStatus['state']): BadgeColor {
  if (state === 'ready') return 'success';
  if (state === 'error') return 'danger';
  if (state === 'initializing') return 'warning';
  return 'neutral';
}

function speStateColor(state: EngineStatus['speState']): BadgeColor {
  if (state === 'ready') return 'success';
  if (state === 'error') return 'danger';
  if (state === 'starting') return 'warning';
  return 'neutral';
}

function formatTime(ts: number | null | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-right">{children}</span>
    </div>
  );
}

function PhaseRow({ label, durationMs, maxMs }: { label: string; durationMs: number; maxMs: number }) {
  const pct = maxMs > 0 ? Math.max(2, (durationMs / maxMs) * 100) : 0;
  return (
    <tr className="border-t">
      <td className="py-2 pr-4 text-sm">{label}</td>
      <td className="py-2 pr-4 text-sm font-mono whitespace-nowrap">{formatDuration(durationMs)}</td>
      <td className="py-2 w-1/2">
        <div className="h-2 bg-muted rounded">
          <div
            className="h-2 bg-primary rounded"
            style={{ width: `${pct}%` }}
          />
        </div>
      </td>
    </tr>
  );
}

export function StatusPage() {
  const { data, isLoading, error } = useEngineStatus();

  const phaseMax = data?.phaseTimings?.reduce((m, p) => Math.max(m, p.durationMs), 0) ?? 0;
  const speAvailable = data?.speState != null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="px-6 py-4">
        <a href="/" aria-label="Home" className="inline-flex items-center gap-3">
          <img src="/mockingbird-tile.svg" alt="" className="size-10" />
          <span className="font-semibold text-xl">Mockingbird</span>
        </a>
      </div>
      <div className="flex-1 flex flex-col gap-6 px-6 pb-12 max-w-5xl w-full mx-auto">
        <h1 className="text-3xl font-bold tracking-tight">Status</h1>

        {isLoading ? (
          <div className="text-muted-foreground">Loading status...</div>
        ) : error ? (
          <div className="text-destructive">Failed to load /api/status: {String(error)}</div>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card style="outline">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Engine</span>
                    <Badge colorScheme={engineStateColor(data.state)} variant="bold">
                      {data.state ?? 'unknown'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col">
                  <Row label="Items">
                    {typeof data.itemCount === 'number' ? data.itemCount.toLocaleString() : '-'}
                  </Row>
                  <Row label="Registry">{data.registryLoaded ? 'loaded' : 'not loaded'}</Row>
                  <Row label="Cache">{data.cacheStale ? 'stale' : 'fresh'}</Row>
                  <Row label="Progress">
                    {data.progress
                      ? `${data.progress.scanned.toLocaleString()} / ${data.progress.total.toLocaleString()}`
                      : '-'}
                  </Row>
                  <Row label="Error">{data.error ?? '-'}</Row>
                </CardContent>
              </Card>

              <Card style="outline">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>PowerShell (SPE)</span>
                    <Badge colorScheme={speStateColor(data.speState)} variant="bold">
                      {data.speState ?? 'unavailable'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col">
                  {speAvailable ? (
                    <>
                      <Row label="Started">{formatTime(data.speStartedAt)}</Row>
                      <Row label="Ready">{formatTime(data.speReadyAt)}</Row>
                      <Row label="Error">{data.speError ?? '-'}</Row>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground py-1">
                      SPE manager not initialized.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card style="outline">
              <CardHeader>
                <CardTitle>Boot phases</CardTitle>
              </CardHeader>
              <CardContent>
                {data.phaseTimings && data.phaseTimings.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Phase</th>
                        <th className="pb-2 pr-4 font-medium">Duration</th>
                        <th className="pb-2 font-medium">Relative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.phaseTimings.map((p) => (
                        <PhaseRow
                          key={p.label}
                          label={p.label}
                          durationMs={p.durationMs}
                          maxMs={phaseMax}
                        />
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-sm text-muted-foreground">No phase timings recorded.</div>
                )}
              </CardContent>
            </Card>

            <div className="text-sm text-muted-foreground">
              Editor:{' '}
              <span className="font-mono text-foreground">
                {data.editorUrlTemplate ?? '-'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
