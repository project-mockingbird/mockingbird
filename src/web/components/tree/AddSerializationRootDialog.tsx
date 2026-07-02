import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  useSerializationRoots,
  useAddSerializationRoot,
  type AddRootBody,
} from '@/hooks/useSerializationRoots';

const SCOPES = ['DescendantsOnly', 'ItemAndDescendants', 'ItemAndChildren', 'SingleItem'] as const;
const NEW_FILE = '__new_file__';

function leaf(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? '';
}

interface DryRunPreview {
  targetFilePath: string;
  willCreateFile: boolean;
  warnings: string[];
}

export function AddSerializationRootDialog({
  open,
  onOpenChange,
  itemPath,
  database,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itemPath: string;
  database: string;
}) {
  const modulesQuery = useSerializationRoots();
  const addRoot = useAddSerializationRoot();
  const [scope, setScope] = useState<string>('DescendantsOnly');
  const [name, setName] = useState<string>('');
  const [targetPath, setTargetPath] = useState<string>(NEW_FILE);
  const [preview, setPreview] = useState<DryRunPreview | null>(null);

  useEffect(() => {
    setName(leaf(itemPath));
  }, [itemPath]);

  const modules = modulesQuery.data?.modules ?? [];

  const body = useMemo<AddRootBody>(
    () => ({
      path: itemPath,
      database,
      scope,
      name: name.trim() || undefined,
      target: targetPath === NEW_FILE ? { newFile: true } : { modulePath: targetPath },
    }),
    [itemPath, database, scope, name, targetPath],
  );

  // Live dry-run preview - refires whenever any field changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/serialization-roots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, dryRun: true }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(p => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, body]);

  const onCreate = async () => {
    try {
      await addRoot.mutateAsync(body);
      toast.success('Serialization root added');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add serialization root');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add serialization root</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-muted-foreground">Path</label>
            <div className="font-mono">{itemPath}</div>
          </div>
          <div>
            <label className="text-muted-foreground">Database</label>
            <div className="font-mono">{database}</div>
          </div>
          <div>
            <label className="text-muted-foreground">Scope</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value)}
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
            >
              {SCOPES.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted-foreground">Folder name</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-muted-foreground">Target file</label>
            <select
              value={targetPath}
              onChange={e => setTargetPath(e.target.value)}
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
            >
              <option value={NEW_FILE}>New file...</option>
              {modules.map(m => (
                <option key={m.filePath} value={m.filePath}>
                  {m.namespace} ({m.filePath})
                </option>
              ))}
            </select>
          </div>
          {preview && (
            <Alert variant="default">
              <AlertDescription>
                {preview.willCreateFile ? 'Creates ' : 'Appends to '}
                <span className="font-mono">{preview.targetFilePath}</span>
                {preview.warnings?.map((w, i) => (
                  <div key={i} className="mt-1 text-yellow-600">
                    {w}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={addRoot.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
