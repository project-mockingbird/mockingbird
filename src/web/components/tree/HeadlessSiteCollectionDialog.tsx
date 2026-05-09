import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { DialogParentPath } from './DialogParentPath';

const TENANT_NAME_REGEX = /^[\w][\w\s\-]*(\(\d+\)){0,1}$/;

function validateTenantName(name: string): string | null {
  if (!name) return 'Tenant name is required';
  if (name.length > 100) return 'Tenant name must be 100 characters or fewer';
  if (!TENANT_NAME_REGEX.test(name)) return `Invalid tenant name: ${name}`;
  return null;
}

type DefinitionItem = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  isSystemModule: boolean;
  includeByDefault: boolean;
  source: string;
};

interface HeadlessSiteCollectionDialogProps {
  open: boolean;
  parentPath: string;
  onConfirm: (input: { tenantName: string; definitionItemIds: string[] }) => void;
  onClose: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

export function HeadlessSiteCollectionDialog({
  open,
  parentPath,
  onConfirm,
  onClose,
  isPending = false,
  serverError = null,
}: HeadlessSiteCollectionDialogProps) {
  const [tenantName, setTenantName] = useState('');
  const [selectedDefIds, setSelectedDefIds] = useState<Set<string>>(new Set());

  const definitionsQuery = useQuery<DefinitionItem[]>({
    queryKey: ['scaffolding', 'tenant-definitions'],
    queryFn: async () => {
      const r = await fetch('/api/scaffolding/tenant-definitions');
      if (!r.ok) throw new Error('Failed to load tenant definitions');
      return r.json();
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setTenantName('');
      const defaults = (definitionsQuery.data ?? [])
        .filter(d => d.includeByDefault)
        .map(d => d.id);
      setSelectedDefIds(new Set(defaults));
    }
  }, [open, definitionsQuery.data]);

  const validationError = useMemo(() => validateTenantName(tenantName), [tenantName]);
  const canSubmit = !validationError && !isPending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm({
      tenantName: tenantName.trim(),
      definitionItemIds: Array.from(selectedDefIds),
    });
  };

  const toggleDef = (id: string) => {
    setSelectedDefIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Headless Site Collection</DialogTitle>
        </DialogHeader>
        <DialogParentPath parentPath={parentPath} />
        <label className="block text-xs font-medium mt-2">Tenant name</label>
        <input
          autoFocus
          type="text"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleConfirm(); if (e.key === 'Escape') onClose(); }}
          className="w-full rounded border bg-background px-2 py-1.5 text-sm"
          disabled={isPending}
        />
        {validationError && tenantName && <p className="text-xs text-destructive mt-1">{validationError}</p>}

        <label className="block text-xs font-medium mt-3">Features</label>
        <div className="border rounded p-2 max-h-48 overflow-y-auto">
          {definitionsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {definitionsQuery.data?.length === 0 && <p className="text-xs text-muted-foreground">No tenant definitions available</p>}
          {definitionsQuery.data?.map(def => (
            <label key={def.id} className="flex items-start gap-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={selectedDefIds.has(def.id)}
                onChange={() => toggleDef(def.id)}
                disabled={isPending}
              />
              <span>
                <span className="font-medium">{def.displayName ?? def.name}</span>
                {def.description && <span className="text-muted-foreground block">{def.description}</span>}
              </span>
            </label>
          ))}
        </div>

        {serverError && <p className="text-xs text-destructive mt-2">{serverError}</p>}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canSubmit}>
            {isPending && <Spinner className="size-3 mr-1" variant="primary" />}
            {isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
