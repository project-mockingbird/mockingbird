import { useState, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
import { toast } from 'sonner';

interface UnusedItem { id: string; name: string; path: string; templateName: string; }
interface UnusedResult { count: number; items: UnusedItem[]; }
interface CleanupResult { deleted: string[]; failed: Array<{ itemId: string; error: string }>; }

interface TreeNode { id: string; name: string; templateName: string; children: TreeNode[]; }

const DATA_ROOT_ID = '__data_root__';

function buildTree(items: UnusedItem[]): TreeNode {
  // Synthetic "Data" root contains all top-level unused items as children.
  // Real items are linked by their /Data/-relative path; an item whose
  // computed parent is missing from the unused set (used parent, unused
  // child) attaches under the Data root rather than vanishing.
  const root: TreeNode = { id: DATA_ROOT_ID, name: 'Data', templateName: '', children: [] };
  const byRelPath = new Map<string, TreeNode>();
  for (const it of items) {
    const dataIdx = it.path.indexOf('/Data/');
    const relPath = dataIdx >= 0 ? it.path.slice(dataIdx + '/Data/'.length) : it.name;
    const segments = relPath.split('/');
    const node: TreeNode = { id: it.id, name: it.name, templateName: it.templateName, children: [] };
    byRelPath.set(relPath, node);
    if (segments.length === 1) {
      root.children.push(node);
    } else {
      const parentPath = segments.slice(0, -1).join('/');
      const parent = byRelPath.get(parentPath);
      if (parent) parent.children.push(node);
      else root.children.push(node);
    }
  }
  return root;
}

function collectAllIds(node: TreeNode, into: Set<string>): void {
  into.add(node.id);
  for (const c of node.children) collectAllIds(c, into);
}

interface Props {
  item: { id: string };
}

export function UnusedDatasourcesBanner({ item }: Props) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([DATA_ROOT_ID]));

  const { data } = useQuery<UnusedResult>({
    queryKey: ['unused-datasources', item.id],
    queryFn: async () => {
      const res = await fetch(`/api/items/${item.id}/unused-datasources`);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return res.json();
    },
  });

  const cleanupMutation = useMutation<CleanupResult, Error, string[]>({
    mutationFn: async (itemIds) => {
      const res = await fetch(`/api/items/${item.id}/unused-datasources/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds }),
      });
      if (!res.ok) throw new Error(`Cleanup failed: ${res.status}`);
      return res.json();
    },
    onSuccess: (result) => {
      const deletedCount = result.deleted.length;
      const failedCount = result.failed.length;
      toast.success(failedCount === 0
        ? `Deleted ${deletedCount} unused items`
        : `Deleted ${deletedCount}, ${failedCount} skipped`);
      queryClient.invalidateQueries({ queryKey: ['unused-datasources', item.id] });
      queryClient.invalidateQueries({ queryKey: ['item', item.id] });
      setConfirmOpen(false);
    },
    onError: (err) => {
      toast.error(`Cleanup failed: ${err.message}`);
    },
  });

  const root = useMemo(() => (data ? buildTree(data.items) : null), [data]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!root) return;
    const all = new Set<string>();
    collectAllIds(root, all);
    setExpanded(all);
  };

  const collapseAll = () => {
    setExpanded(new Set([DATA_ROOT_ID]));
  };

  if (!data || data.count === 0) return null;
  const { count, items } = data;

  return (
    <>
      <Alert variant="warning">
        <AlertTitle>{count} unused local datasource items</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>There are {count} unused local datasource items. Would you like to delete them?</span>
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>Clean up</Button>
        </AlertDescription>
      </Alert>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => { if (!cleanupMutation.isPending) setConfirmOpen(o); }}
      >
        <AlertDialogContent className="sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count} unused datasource items?</AlertDialogTitle>
            <AlertDialogDescription>
              These items and their YAML files will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center justify-end gap-2 text-xs">
            <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={expandAll}>Expand all</button>
            <span className="text-muted-foreground">|</span>
            <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={collapseAll}>Collapse all</button>
          </div>
          <ul className="max-h-80 overflow-auto rounded border border-border bg-muted/30 p-2 text-sm">
            {root && renderNode(root, 0, expanded, toggle)}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={cleanupMutation.isPending}
              onClick={(e) => {
                // Keep the dialog open while the mutation is in flight so the
                // loading state is visible. onSuccess closes it.
                e.preventDefault();
                cleanupMutation.mutate(items.map(i => i.id));
              }}
            >
              {cleanupMutation.isPending ? `Deleting ${count}...` : `Delete ${count}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function renderNode(node: TreeNode, depth: number, expanded: Set<string>, toggle: (id: string) => void): ReactNode {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  return (
    <li key={node.id} className="py-0.5">
      <div
        style={{ paddingLeft: `${depth * 1.25}rem` }}
        className="flex w-full items-center gap-1 whitespace-nowrap"
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className="flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            <Icon path={isOpen ? mdiChevronDown : mdiChevronRight} className="size-4" />
          </button>
        ) : (
          <span className="size-4" />
        )}
        <span className="font-medium">{node.name}</span>
        {node.templateName && (
          <span className="ml-auto text-xs text-muted-foreground">[{node.templateName}]</span>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul>{node.children.map((c) => renderNode(c, depth + 1, expanded, toggle))}</ul>
      )}
    </li>
  );
}
