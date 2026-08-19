// src/web/components/sitecoreai/DeployDialog.tsx
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listEnvs, type EnvEntry } from '@/lib/environmentsApi';
import { previewDeploy, runDeploy, formatPlanSummary, type DeployPlan, type DeployProgress, type DeploySource } from '@/lib/deploy';

const STRATEGIES: { value: string; label: string }[] = [
  { value: 'skip', label: 'Skip items that already exist' },
  { value: 'keepExisting', label: 'Keep existing (create new only)' },
  { value: 'overwrite', label: 'Overwrite existing' },
];

export function DeployDialog({ open, onOpenChange, sources, onManageEnvironments }: {
  open: boolean; onOpenChange: (o: boolean) => void; sources: DeploySource[]; onManageEnvironments?: () => void;
}) {
  const [envs, setEnvs] = useState<EnvEntry[]>([]);
  const [envId, setEnvId] = useState('');
  const [strategy, setStrategy] = useState('skip');
  const [plan, setPlan] = useState<DeployPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DeployProgress | null>(null);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setPlan(null); setProgress(null); setError(''); setBusy(false); setShowDetails(false);
    listEnvs().then((e) => { setEnvs(e); if (e[0]) setEnvId(e[0].id); }).catch((err) => setError(String(err)));
  }, [open]);

  const resetPlanState = () => { setPlan(null); setProgress(null); setError(''); };

  const onPreview = async () => {
    setBusy(true); setError(''); setProgress(null); setPlan(null);
    try { setPlan(await previewDeploy(envId, sources, strategy)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const canDeploy = !!plan && plan.blockingErrors.length === 0 && !busy;

  const onDeploy = async () => {
    setBusy(true); setError(''); setProgress(null);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const final = await runDeploy(envId, sources, strategy, setProgress, ac.signal);
      setProgress(final);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setProgress({ kind: 'error', completed: 0, total: 0, message: 'Cancelled' });
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally { setBusy(false); abortRef.current = null; }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Deploy to SitecoreAI</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="mb-1 block">Target environment</Label>
            {envs.length === 0
              ? <p className="text-sm text-amber-600">No environments configured. <button className="underline" onClick={onManageEnvironments}>Manage environments</button></p>
              : <Select value={envId} onValueChange={(v) => { setEnvId(v); resetPlanState(); }} disabled={busy}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select an environment" /></SelectTrigger>
                  <SelectContent>
                    {envs.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>}
          </div>
          <div>
            <Label className="mb-1 block">Conflict strategy</Label>
            <RadioGroup value={strategy} onValueChange={(v) => { setStrategy(v); resetPlanState(); }} disabled={busy}>
              {STRATEGIES.map((s) => (
                <div key={s.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={s.value} id={`strat-${s.value}`} />
                  <Label htmlFor={`strat-${s.value}`}>{s.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          {plan && (
            <div className="text-sm space-y-1">
              <p className="flex items-center gap-2">
                <span>Plan: {formatPlanSummary(plan)}</span>
                {plan.steps.length > 0 && (
                  <button type="button" className="underline text-muted-foreground" onClick={() => setShowDetails((v) => !v)}>
                    {showDetails ? 'Hide details' : 'Details'}
                  </button>
                )}
              </p>
              {showDetails && plan.steps.length > 0 && (
                <ul className="max-h-48 overflow-auto rounded border divide-y text-xs">
                  {plan.steps.map((s) => (
                    <li key={s.itemId} className="flex items-center gap-2 px-2 py-1">
                      <span className={`w-14 shrink-0 font-medium ${s.action === 'create' ? 'text-emerald-600' : s.action === 'update' ? 'text-amber-600' : 'text-muted-foreground'}`}>{s.action}</span>
                      <span className="truncate" title={s.path}>{s.path}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
              {plan.blockingErrors.length > 0 && (
                <div className="text-red-600">
                  <p>{plan.blockingErrors.length} blocking issue(s):</p>
                  <ul className="list-disc pl-5">{plan.blockingErrors.slice(0, 10).map((b) => <li key={b.itemId}>{b.path}: {b.reason}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          {progress && (
            <div className="text-sm">
              {progress.kind === 'progress' && <p className="flex items-center gap-2"><Spinner className="size-3" /> {progress.message} ({progress.completed}/{progress.total})</p>}
              {progress.kind === 'done' && <p className="text-emerald-600">Done. {progress.message}</p>}
              {progress.kind === 'error' && <p className="text-red-600">{progress.message}</p>}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          {busy && <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>Cancel</Button>}
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          <Button size="sm" variant="outline" onClick={onPreview} disabled={!envId || busy}>Preview</Button>
          <Button size="sm" onClick={onDeploy} disabled={!canDeploy}>{busy && <Spinner className="size-3 mr-1" variant="primary" />}Deploy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
