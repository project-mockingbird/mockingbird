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

const SITE_NAME_REGEX = /^[\w][\w\s\-]*(\(\d+\)){0,1}$/;

function validateSiteName(name: string): string | null {
  if (!name) return 'Site name is required';
  if (name.length > 100) return 'Site name must be 100 characters or fewer';
  if (!SITE_NAME_REGEX.test(name)) return `Invalid site name: ${name}`;
  return null;
}

type DefinitionItem = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  includeByDefault: boolean;
  source: string;
};

export type HeadlessSiteSubmit = {
  siteName: string;
  hostName: string;
  virtualFolder: string;
  language: string;
  definitionItemIds: string[];
  graphQLEndpoint: string;
  deploymentSecret: string;
};

interface HeadlessSiteDialogProps {
  open: boolean;
  parentPath: string;
  onConfirm: (input: HeadlessSiteSubmit) => void;
  onClose: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

type Tab = 'general' | 'features';

export function HeadlessSiteDialog({
  open,
  parentPath,
  onConfirm,
  onClose,
  isPending = false,
  serverError = null,
}: HeadlessSiteDialogProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [siteName, setSiteName] = useState('');
  const [hostName, setHostName] = useState('*');
  const [virtualFolder, setVirtualFolder] = useState('/');
  const [language, setLanguage] = useState('en');
  const [graphQLEndpoint, setGraphQLEndpoint] = useState('');
  const [deploymentSecret, setDeploymentSecret] = useState('');
  const [selectedDefIds, setSelectedDefIds] = useState<Set<string>>(new Set());

  const definitionsQuery = useQuery<DefinitionItem[]>({
    queryKey: ['scaffolding', 'site-definitions'],
    queryFn: async () => {
      const r = await fetch('/api/scaffolding/site-definitions');
      if (!r.ok) throw new Error('Failed to load site definitions');
      return r.json();
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setTab('general');
      setSiteName('');
      setHostName('*');
      setVirtualFolder('/');
      setLanguage('en');
      setGraphQLEndpoint('');
      setDeploymentSecret('');
      const defaults = (definitionsQuery.data ?? [])
        .filter(d => d.includeByDefault)
        .map(d => d.id);
      setSelectedDefIds(new Set(defaults));
    }
  }, [open, definitionsQuery.data]);

  const validationError = useMemo(() => validateSiteName(siteName), [siteName]);
  const canSubmit = !validationError && !isPending && hostName.length > 0 && virtualFolder.length > 0;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm({
      siteName: siteName.trim(),
      hostName,
      virtualFolder,
      language,
      definitionItemIds: Array.from(selectedDefIds),
      graphQLEndpoint,
      deploymentSecret,
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
          <DialogTitle>Create Headless Site</DialogTitle>
        </DialogHeader>
        <DialogParentPath parentPath={parentPath} />

        <div className="flex border-b mt-2">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs ${tab === 'general' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
            onClick={() => setTab('general')}
          >
            General
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs ${tab === 'features' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
            onClick={() => setTab('features')}
          >
            Features
          </button>
        </div>

        {tab === 'general' && (
          <div className="space-y-2 mt-2">
            <div>
              <label className="block text-xs font-medium">Site name</label>
              <input
                autoFocus
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                disabled={isPending}
              />
              {validationError && siteName && <p className="text-xs text-destructive mt-1">{validationError}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium">Host name</label>
              <input type="text" value={hostName} onChange={(e) => setHostName(e.target.value)}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm" disabled={isPending}/>
            </div>
            <div>
              <label className="block text-xs font-medium">Virtual folder</label>
              <input type="text" value={virtualFolder} onChange={(e) => setVirtualFolder(e.target.value)}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm" disabled={isPending}/>
            </div>
            <div>
              <label className="block text-xs font-medium">Language</label>
              <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm" disabled={isPending}/>
            </div>
          </div>
        )}

        {tab === 'features' && (
          <div className="space-y-3 mt-2">
            <div>
              <label className="block text-xs font-medium">Features</label>
              <div className="border rounded p-2 max-h-48 overflow-y-auto">
                {definitionsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
                {definitionsQuery.data?.length === 0 && <p className="text-xs text-muted-foreground">No site definitions available</p>}
                {definitionsQuery.data?.map(def => (
                  <label key={def.id} className="flex items-start gap-2 py-1 text-xs">
                    <input type="checkbox" checked={selectedDefIds.has(def.id)} onChange={() => toggleDef(def.id)} disabled={isPending}/>
                    <span>
                      <span className="font-medium">{def.displayName ?? def.name}</span>
                      {def.description && <span className="text-muted-foreground block">{def.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium">GraphQL endpoint</label>
              <input type="text" value={graphQLEndpoint} onChange={(e) => setGraphQLEndpoint(e.target.value)}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm" disabled={isPending}/>
            </div>
            <div>
              <label className="block text-xs font-medium">Deployment secret</label>
              <input type="text" value={deploymentSecret} onChange={(e) => setDeploymentSecret(e.target.value)}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm" disabled={isPending}/>
            </div>
          </div>
        )}

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
