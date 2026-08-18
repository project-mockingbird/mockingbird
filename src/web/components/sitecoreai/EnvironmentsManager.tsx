// src/web/components/sitecoreai/EnvironmentsManager.tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listEnvs, saveEnv, deleteEnv, testEnv, type EnvEntry } from '@/lib/environmentsApi';

function randomId(): string {
  return 'env-' + Math.random().toString(36).slice(2, 10);
}

export function EnvironmentsManager({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [envs, setEnvs] = useState<EnvEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', cmHost: '', clientId: '', clientSecret: '' });
  const [status, setStatus] = useState<string>('');

  const refresh = async () => { try { setEnvs(await listEnvs()); } catch (e) { setStatus(String(e)); } };
  useEffect(() => { if (open) { refresh(); setEditingId(null); setStatus(''); } }, [open]);

  const startNew = () => { setEditingId(randomId()); setForm({ name: '', cmHost: '', clientId: '', clientSecret: '' }); };
  const startEdit = (e: EnvEntry) => { setEditingId(e.id); setForm({ name: e.name, cmHost: e.cmHost, clientId: '', clientSecret: '' }); };

  const onSave = async () => {
    if (!editingId) return;
    setStatus('Saving...');
    try { await saveEnv(editingId, form); setEditingId(null); await refresh(); setStatus('Saved.'); }
    catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
  };
  const onDelete = async (id: string) => { try { await deleteEnv(id); await refresh(); } catch (e) { setStatus(String(e)); } };
  const onTest = async (id: string) => {
    setStatus('Testing...');
    try { await testEnv(id); setStatus('Connection OK.'); }
    catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>SitecoreAI Environments</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <ul className="space-y-1">
            {envs.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                <span>{e.name} <span className="text-muted-foreground">({e.cmHost})</span>{!e.hasSecret && <span className="text-amber-600"> - no secret</span>}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => onTest(e.id)}>Test</Button>
                  <Button size="sm" variant="outline" onClick={() => startEdit(e)}>Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => onDelete(e.id)}>Remove</Button>
                </span>
              </li>
            ))}
          </ul>
          {!editingId && <Button size="sm" onClick={startNew}>Add environment</Button>}
          {editingId && (
            <div className="space-y-2 border-t pt-2">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>CM host</Label><Input value={form.cmHost} placeholder="xmc-acme-dev.sitecorecloud.io" onChange={(e) => setForm({ ...form, cmHost: e.target.value })} /></div>
              <div><Label>Client ID</Label><Input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} /></div>
              <div><Label>Client secret</Label><Input type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} /></div>
              <div className="flex gap-2"><Button size="sm" onClick={onSave}>Save</Button><Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button></div>
            </div>
          )}
          {status && <p className="text-xs text-muted-foreground">{status}</p>}
        </div>
        <DialogFooter><Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
