
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  mdiFolder,
  mdiFile,
  mdiChevronRight,
  mdiFileCode,
  mdiViewColumn,
  mdiFormTextbox,
  mdiMonitor,
  mdiCube,
  mdiLoading,
  mdiMagnify,
  mdiUnfoldLessHorizontal,
} from '@mdi/js';
import { Icon } from '@/lib/icon';
import { useTree, useChildren, useCreateItem, useDeleteItem, useAncestors } from '@/hooks/useItems';
import { useValidation } from '@/hooks/useValidation';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { TreeNode, InsertOption } from '@/lib/types';
import { useInsertOptions } from '@/hooks/useInsertOptions';
import { useInsertItem } from '@/hooks/useInsertItem';
import { useDuplicateItem } from '@/hooks/useDuplicateItem';
import { useCopyItem } from '@/hooks/useCopyItem';
import { useMoveItem } from '@/hooks/useMoveItem';
import { useRefreshItem } from '@/hooks/useRefreshItem';
import { useRenameItem } from '@/hooks/useRenameItem';
import { NoProjectState } from '@/components/no-project/NoProjectState';
import { InsertItemDialog } from './InsertItemDialog';
import { HeadlessSiteCollectionDialog } from './HeadlessSiteCollectionDialog';
import { ScaffoldConfirmDialog, type CoverageGap } from './ScaffoldConfirmDialog';
import { HeadlessSiteDialog } from './HeadlessSiteDialog';
import { DuplicateItemDialog } from './DuplicateItemDialog';
import { CopyMoveDestinationDialog } from './CopyMoveDestinationDialog';
import { RenameItemDialog } from './RenameItemDialog';
import { DialogParentPath } from './DialogParentPath';
import { RowActionIcons } from './RowActionIcons';
import { InsertDialogWithTemplateDropdown } from './InsertDialogWithTemplateDropdown';
import { InsertFromTemplateDialog } from './InsertFromTemplateDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { AddToPackageDialog } from '@/components/package/AddToPackageDialog';
import {
  useTreeKeyboardNav,
  TreeKeyboardNavProvider,
  useTreeKeyboardNavContext,
} from './useTreeKeyboardNav';
import { useNodeExpansion } from '@/state/useNodeExpansion';
import { useTabId } from '@/state/tabContext';
import { workspaceStore } from '@/state/workspaceStore';
import { useLayerState } from '@/state/layerState';
import { ProvenanceBar } from './ProvenanceBar';
import { LayerLegend } from './LayerLegend';
import { containingFolder } from '@/lib/folder-path';
import { pickNeighborAfterDelete } from '@/lib/delete-neighbor';
import { toast } from 'sonner';

// ---- type-to-icon map (mirrors old TreeNode.tsx TYPE_ICONS) ----
const TYPE_ICON_PATHS: Record<string, string> = {
  template: mdiFileCode,
  templateSection: mdiViewColumn,
  templateField: mdiFormTextbox,
  rendering: mdiMonitor,
  unknown: mdiCube,
};

function nodeIconPath(node: TreeNode): string {
  if (node.hasChildren) return mdiFolder;
  return TYPE_ICON_PATHS[node.type] ?? mdiFile;
}

// Parent path of a slash-delimited Sitecore path. Returns '/' when the input
// is a top-level item (or '/' itself). Used by the Duplicate dialog: the
// duplicated item is a SIBLING of the source, so its parent equals the
// source's parent, not the source itself.
function parentPathOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.substring(0, i);
}

// ---- create-item dialog ----

type CreateType = 'section' | 'field';

interface CreateDialogProps {
  open: boolean;
  label: string;
  parentPath: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

function CreateDialog({ open, label, parentPath, onConfirm, onClose }: CreateDialogProps) {
  const [value, setValue] = useState('');

  const handleConfirm = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
    setValue('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setValue(''); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <DialogParentPath parentPath={parentPath} />
        <input
          autoFocus
          type="text"
          placeholder="Name..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') { setValue(''); onClose(); }
          }}
          className="w-full rounded border bg-background px-2 py-1.5 text-sm"
        />
        <DialogFooter>
          <button
            onClick={() => { setValue(''); onClose(); }}
            className="rounded-sm px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Create
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- single tree-node row ----

interface ContentTreeNodeProps {
  node: TreeNode;
  parentId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
  collapseKey: number;
  validationErrors: Set<string>;
  database: string;
  autoExpandIds: Set<string>;
  layerColors?: Record<string, string>;
  layerVisibility?: Record<string, boolean>;
}

function ContentTreeNode({
  node,
  parentId,
  selectedId,
  onSelect,
  depth,
  collapseKey,
  validationErrors,
  database,
  autoExpandIds,
  layerColors = {},
  layerVisibility = {},
}: ContentTreeNodeProps) {
  const { isExpanded: expanded, setExpanded } = useNodeExpansion(node.id, node.autoExpand ?? false);
  const isSelected = node.id === selectedId;
  const hasError = validationErrors.has(node.id);
  const isRegistry = node.source === 'registry';
  const rowRef = useRef<HTMLDivElement | null>(null);

  // Reset expand state when collapseKey increments
  const [prevCollapseKey, setPrevCollapseKey] = useState(collapseKey);
  if (collapseKey !== prevCollapseKey) {
    setPrevCollapseKey(collapseKey);
    setExpanded(false);
  }

  // Force expand when an ancestor walk requests it (e.g. external navigation
  // from QuickInfo). Doesn't override later user collapses since the set
  // gets cleared once the target is reached.
  useEffect(() => {
    if (autoExpandIds.has(node.id)) {
      setExpanded(true);
    }
  }, [autoExpandIds, node.id]);

  const kbNav = useTreeKeyboardNavContext();
  const isFocused = kbNav.focusedId === node.id;

  // Listen for keyboard-driven expand/collapse intents bubbled from the
  // container. ContentTree dispatches a CustomEvent on the container with
  // `detail = { kind: 'expand' | 'collapse', id: string }` when the
  // keyboard hook produces an expand or collapse intent. Each node
  // subscribes once and applies the toggle if the id matches.
  useEffect(() => {
    const container = rowRef.current?.closest<HTMLElement>('[role="tree"]');
    if (!container) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: 'expand' | 'collapse'; id: string }>).detail;
      if (!detail || detail.id !== node.id) return;
      if (detail.kind === 'expand') setExpanded(true);
      if (detail.kind === 'collapse') setExpanded(false);
    };
    container.addEventListener('tree-keyboard-intent', handler);
    return () => container.removeEventListener('tree-keyboard-intent', handler);
  }, [node.id]);

  // Scroll into view when this row becomes the selected one. Block: 'nearest'
  // keeps the scroll cheap when the row is already visible.
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  // Lazy-load children on first expand
  const needsLazyLoad = expanded && node.hasChildren && !node.children;
  const { data: lazyChildren, isLoading } = useChildren(needsLazyLoad ? node.id : null, database);

  const children = node.children ?? lazyChildren ?? [];

  // Context menu state
  const createItem = useCreateItem();
  const deleteItem = useDeleteItem();
  const [createDialog, setCreateDialog] = useState<{ label: string; type: CreateType } | null>(null);

  // Insert submenu state. The submenu OPEN signal flips `insertSubOpen` true,
  // which gates the lazy useInsertOptions fetch (no fetch on every right-click).
  const [insertSubOpen, setInsertSubOpen] = useState(false);
  const [insertDialog, setInsertDialog] = useState<InsertOption | null>(null);
  const [insertServerError, setInsertServerError] = useState<string | null>(null);
  const insertOptionsQuery = useInsertOptions(node.id, insertSubOpen);
  const insertItem = useInsertItem();

  // SXA Headless scaffolding dialog state. Surfaces only on /sitecore/content
  // (Headless Site Collection) and on items whose template is JSSTenant
  // {b91811f1-...} (Headless Site).
  const [headlessTenantOpen, setHeadlessTenantOpen] = useState(false);
  const [headlessTenantPending, setHeadlessTenantPending] = useState(false);
  const [headlessTenantServerError, setHeadlessTenantServerError] = useState<string | null>(null);
  const [headlessSiteOpen, setHeadlessSiteOpen] = useState(false);
  const [headlessSitePending, setHeadlessSitePending] = useState(false);
  const [headlessSiteServerError, setHeadlessSiteServerError] = useState<string | null>(null);

  // Two-phase scaffold confirmation: dryRun returns a proposed module-config
  // file the user must approve before mockingbird touches their serialization
  // tree. `pendingScaffold` holds the original POST body + the dry-run result
  // until the user accepts (re-POST with acceptModuleConfig=true) or cancels.
  type PendingScaffold = {
    kind: 'tenant' | 'site';
    body: Record<string, unknown>;
    successLabel: string;
    proposalFilePath: string;
    proposalContents: object;
    coverageGaps: CoverageGap[];
  };
  const [pendingScaffold, setPendingScaffold] = useState<PendingScaffold | null>(null);
  const [pendingScaffoldAccepting, setPendingScaffoldAccepting] = useState(false);
  const [pendingScaffoldServerError, setPendingScaffoldServerError] = useState<string | null>(null);
  const isContentRoot = node.path === '/sitecore/content';
  const isJssTenant = node.template?.toLowerCase() === 'b91811f1-fa8b-47f8-b131-bd2c6d5ec805';
  // JSS Site Folder template id - present in the Headless Tenant template's
  // SV __Masters in OOTB Sitecore. Mockingbird replaces the raw template-
  // create with the "Headless Site" scaffolding wizard, so this template
  // option is filtered out for JSS tenants to avoid two competing flows.
  const JSS_SITE_FOLDER_TPL = 'ce91fbd6-4d89-42c9-b5bc-2a670439e1ff';
  const visibleInsertOptions = isJssTenant
    ? (insertOptionsQuery.data?.options ?? []).filter(o => o.templateId.toLowerCase() !== JSS_SITE_FOLDER_TPL)
    : (insertOptionsQuery.data?.options ?? []);

  /**
   * Two-phase scaffold submit. Phase 1: send the request with `dryRun:true`.
   * If the server returns a `proposedModuleConfig`, stash it and open the
   * confirmation dialog (Phase 2). Otherwise (no module file needed), proceed
   * directly to the live POST. The Phase 2 accept handler (`acceptScaffold`)
   * re-sends the same body with `acceptModuleConfig:true`.
   */
  const submitScaffoldDryRun = async (
    kind: 'tenant' | 'site',
    body: Record<string, unknown>,
    successLabel: string,
    setPending: (v: boolean) => void,
    setServerError: (v: string | null) => void,
    closeOriginalDialog: () => void,
  ) => {
    setServerError(null);
    setPending(true);
    try {
      const dryR = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, dryRun: true }),
      });
      if (!dryR.ok) {
        const errBody = await dryR.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Server error ${dryR.status}`);
      }
      const dryJson = await dryR.json() as {
        proposedModuleConfig?: { filePath: string; contents: object };
        coverageGaps?: CoverageGap[];
      };
      if (dryJson.proposedModuleConfig) {
        setPendingScaffold({
          kind,
          body,
          successLabel,
          proposalFilePath: dryJson.proposedModuleConfig.filePath,
          proposalContents: dryJson.proposedModuleConfig.contents,
          coverageGaps: dryJson.coverageGaps ?? [],
        });
        return;
      }
      // No proposal needed - live submit straight away.
      const liveR = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!liveR.ok) {
        const errBody = await liveR.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Server error ${liveR.status}`);
      }
      closeOriginalDialog();
      toast.success(successLabel);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const acceptScaffold = async () => {
    if (!pendingScaffold) return;
    setPendingScaffoldServerError(null);
    setPendingScaffoldAccepting(true);
    try {
      const r = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingScaffold.body, acceptModuleConfig: true }),
      });
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Server error ${r.status}`);
      }
      toast.success(pendingScaffold.successLabel);
      // Close everything.
      setPendingScaffold(null);
      if (pendingScaffold.kind === 'tenant') {
        setHeadlessTenantOpen(false);
        setHeadlessTenantServerError(null);
      } else {
        setHeadlessSiteOpen(false);
        setHeadlessSiteServerError(null);
      }
    } catch (err) {
      setPendingScaffoldServerError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingScaffoldAccepting(false);
    }
  };

  const cancelPendingScaffold = () => {
    setPendingScaffold(null);
    setPendingScaffoldServerError(null);
  };

  const handleScaffoldTenant = (input: { tenantName: string; definitionItemIds: string[] }) => {
    return submitScaffoldDryRun(
      'tenant',
      {
        type: 'scaffold-headless-tenant',
        tenantLocation: node.path,
        tenantName: input.tenantName,
        definitionItemIds: input.definitionItemIds,
      },
      `Tenant "${input.tenantName}" created`,
      setHeadlessTenantPending,
      setHeadlessTenantServerError,
      () => setHeadlessTenantOpen(false),
    );
  };

  const handleScaffoldSite = (input: { siteName: string; hostName: string; virtualFolder: string; language: string; definitionItemIds: string[]; graphQLEndpoint: string; deploymentSecret: string }) => {
    return submitScaffoldDryRun(
      'site',
      {
        type: 'scaffold-headless-site',
        siteLocation: node.path,
        siteName: input.siteName,
        hostName: input.hostName,
        virtualFolder: input.virtualFolder,
        language: input.language,
        definitionItemIds: input.definitionItemIds,
        graphQLEndpoint: input.graphQLEndpoint,
        deploymentSecret: input.deploymentSecret,
      },
      `Site "${input.siteName}" created`,
      setHeadlessSitePending,
      setHeadlessSiteServerError,
      () => setHeadlessSiteOpen(false),
    );
  };

  const handleInsert = async (name: string) => {
    if (!insertDialog) return;
    setInsertServerError(null);
    try {
      await insertItem.mutateAsync({
        type: 'fromTemplate',
        parentPath: node.path,
        templateId: insertDialog.templateId,
        name,
      });
      setInsertDialog(null);
      toast.success(`Inserted "${name}"`);
    } catch (err) {
      setInsertServerError(err instanceof Error ? err.message : String(err));
    }
  };

  // Duplicate state. Siblings of `node` (excluding `node` itself), for
  // client-side duplicate-name collision checking. Read from the parent's
  // loaded children (React Query dedupes by key so this query shares cache
  // with the tree's own expansion fetch - the user can only see this row
  // because its parent was expanded, which loaded the parent's children).
  // On a cache miss, falls back to empty; the engine still validates
  // server-side and the dialog surfaces collisions via serverError.
  const duplicateItem = useDuplicateItem();
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateServerError, setDuplicateServerError] = useState<string | null>(null);
  const parentChildrenQuery = useChildren(parentId, database);
  const siblingsForDuplicate = useMemo(() => {
    const children = parentChildrenQuery.data ?? [];
    return children
      .filter((c: { id: string }) => c.id !== node.id)
      .map((c: { name: string }) => c.name);
  }, [parentChildrenQuery.data, node.id]);

  const handleDuplicate = async (newName: string) => {
    setDuplicateServerError(null);
    try {
      await duplicateItem.mutateAsync({ type: 'duplicate', sourceId: node.id, name: newName });
      setDuplicateDialogOpen(false);
      toast.success(`Duplicated "${node.name}" to "${newName}"`);
    } catch (err) {
      setDuplicateServerError(err instanceof Error ? err.message : String(err));
    }
  };

  // Copy / Move state. Each opens the same dialog component with a different
  // mode prop; the disabled set is computed inside the dialog from descendant
  // ids passed in via props. We only fetch the source's children (for the
  // Move-mode disable list) when the Move dialog is open.
  const copyItem = useCopyItem();
  const moveItem = useMoveItem();
  const refreshItemMutation = useRefreshItem();
  const handleRefresh = () => {
    refreshItemMutation.mutate(node.id, {
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : String(err));
      },
      onSuccess: (data) => {
        toast.success(`Refreshed ${data.refreshed} item${data.refreshed === 1 ? '' : 's'} from disk`);
      },
    });
  };

  // Rename state. Sibling names exclude this item's current name; the
  // engine refuses no-change rename, so the dialog also blocks submit when
  // input == current name.
  const renameItemMutation = useRenameItem();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameServerError, setRenameServerError] = useState<string | null>(null);
  const siblingsForRename = useMemo(() => {
    const children = parentChildrenQuery.data ?? [];
    return children
      .filter((c: { id: string }) => c.id !== node.id)
      .map((c: { name: string }) => c.name);
  }, [parentChildrenQuery.data, node.id]);
  const handleRenameConfirm = async (newName: string) => {
    setRenameServerError(null);
    try {
      await renameItemMutation.mutateAsync({ itemId: node.id, newName });
      setRenameDialogOpen(false);
      toast.success(`Renamed "${node.name}" to "${newName}"`);
    } catch (err) {
      setRenameServerError(err instanceof Error ? err.message : String(err));
    }
  };
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [copyServerError, setCopyServerError] = useState<string | null>(null);
  const [moveServerError, setMoveServerError] = useState<string | null>(null);

  // Lazy-load this node's children for the Move-mode disable set. useChildren
  // returns immediate children only; we walk any pre-resolved .children chains
  // to gather descendants that have already been loaded into cache. The engine
  // is the source of truth and validates server-side, so a partial set just
  // means the user might be able to pick a descendant whose subtree wasn't
  // expanded yet - the engine will then reject the move.
  const moveChildrenQuery = useChildren(moveDialogOpen ? node.id : null, database);
  const sourceDescendantIds = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    function collect(n: TreeNode) {
      set.add(n.id);
      for (const c of n.children ?? []) collect(c);
    }
    for (const c of moveChildrenQuery.data ?? []) collect(c);
    return set;
  }, [moveChildrenQuery.data]);

  const handleCopyConfirm = async (destinationParentId: string) => {
    setCopyServerError(null);
    try {
      const created = await copyItem.mutateAsync({
        sourceId: node.id,
        destinationParentId,
      });
      setCopyDialogOpen(false);
      // Select the new copy (its id comes back on the response).
      onSelect(created.id);
      toast.success(`Copied "${node.name}" to ${created.path}`);
    } catch (err) {
      setCopyServerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleMoveConfirm = async (destinationParentId: string) => {
    setMoveServerError(null);
    try {
      const moved = await moveItem.mutateAsync({
        sourceId: node.id,
        destinationParentId,
      });
      setMoveDialogOpen(false);
      // Same id, new path - cursor follows.
      onSelect(node.id);
      toast.success(`Moved "${node.name}" to ${moved.path}`);
    } catch (err) {
      setMoveServerError(err instanceof Error ? err.message : String(err));
    }
  };

  // + icon (row-hover) insert state. Distinct flow from the right-click
  // submenu: opens InsertDialogWithTemplateDropdown which presents a
  // template picker AND a name field in a single dialog. Siblings of the
  // new child are THIS node's children; we lazy-fetch them only when the
  // dialog opens. React Query dedupes by ['children', node.id, database],
  // so this hits the same cache as the tree's expansion fetch when present.
  const [iconInsertDialogOpen, setIconInsertDialogOpen] = useState(false);
  const [iconInsertServerError, setIconInsertServerError] = useState<string | null>(null);
  const myChildrenQuery = useChildren(
    iconInsertDialogOpen ? node.id : null,
    database,
  );
  const siblingsForIconInsert = useMemo(() => {
    return (myChildrenQuery.data ?? []).map((c: { name: string }) => c.name);
  }, [myChildrenQuery.data]);

  const handleIconInsert = async (req: { templateId: string; name: string }) => {
    setIconInsertServerError(null);
    try {
      await insertItem.mutateAsync({
        type: 'fromTemplate',
        parentPath: node.path,
        templateId: req.templateId,
        name: req.name,
      });
      setIconInsertDialogOpen(false);
      toast.success(`Inserted "${req.name}"`);
    } catch (err) {
      setIconInsertServerError(err instanceof Error ? err.message : String(err));
    }
  };

  // Insert-from-template state. Opens from the right-click Insert submenu's
  // "Insert from template..." entry. Like the + icon flow, siblings are this
  // node's children; lazy-fetch via useChildren when the dialog opens. React
  // Query dedupes by ['children', node.id, database] so it shares cache with
  // the tree's own expansion fetch when present.
  const [insertFromTemplateDialogOpen, setInsertFromTemplateDialogOpen] = useState(false);
  const [insertFromTemplateServerError, setInsertFromTemplateServerError] = useState<string | null>(null);
  const myChildrenForFromTemplate = useChildren(
    insertFromTemplateDialogOpen ? node.id : null,
    database,
  );
  const siblingsForInsertFromTemplate = useMemo(() => {
    return (myChildrenForFromTemplate.data ?? []).map((c: { name: string }) => c.name);
  }, [myChildrenForFromTemplate.data]);

  const handleInsertFromTemplate = async (req: { templateId: string; name: string }) => {
    setInsertFromTemplateServerError(null);
    try {
      await insertItem.mutateAsync({
        type: 'fromTemplate',
        parentPath: node.path,
        templateId: req.templateId,
        name: req.name,
      });
      setInsertFromTemplateDialogOpen(false);
      toast.success(`Inserted "${req.name}"`);
    } catch (err) {
      setInsertFromTemplateServerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleCreate = async (name: string) => {
    if (!createDialog) return;
    try {
      await createItem.mutateAsync({
        type: createDialog.type,
        name,
        parentPath: node.path,
        fieldType: createDialog.type === 'field' ? 'Single-Line Text' : undefined,
      });
      toast.success(`Created "${name}"`);
    } catch (err) {
      toast.error(`Create failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const handleDelete = () => setDeleteDialogOpen(true);
  const handleDeleteConfirm = async () => {
    // Compute the neighbor BEFORE the delete so the siblings array still
    // contains this row. parentChildrenQuery is already loaded since this row
    // is only rendered when its parent is expanded.
    const siblings = parentChildrenQuery.data ?? [];
    const neighborId = pickNeighborAfterDelete(siblings, node.id, parentId);

    try {
      await deleteItem.mutateAsync(node.id);
      setDeleteDialogOpen(false);
      if (selectedId === node.id && neighborId) onSelect(neighborId);
      toast.success(`Deleted "${node.name}"`);
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Packaging state. Both Add to Package and Download Tree share the same
  // dialog (AddToPackageDialog) - the only difference is the submit behavior:
  // 'cart' appends to packageCartStore, 'download' POSTs through
  // downloadPackage directly and triggers a browser download. Both are gated
  // `disabled={isRegistry}` at the submenu trigger because OOTB Sitecore
  // content is not packageable in v1.
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [packageDialogMode, setPackageDialogMode] = useState<'cart' | 'download'>('cart');
  const openAddToPackage = () => { setPackageDialogMode('cart'); setPackageDialogOpen(true); };
  const openDownloadTree = () => { setPackageDialogMode('download'); setPackageDialogOpen(true); };

  const iconPath = nodeIconPath(node);

  const menuItems = [
    ...(node.type === 'template'
      ? [{ label: 'New Section', type: 'section' as CreateType }]
      : []),
    ...(node.type === 'templateSection'
      ? [{ label: 'New Field', type: 'field' as CreateType }]
      : []),
  ];

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            <div
              ref={rowRef}
              {...kbNav.getRowProps({
                id: node.id,
                level: depth,
                isParent: !!node.hasChildren,
                isExpanded: expanded,
              })}
              className={cn(
                'relative group flex h-6 items-center gap-1 cursor-pointer px-1 text-sm rounded-sm',
                'focus:outline-none',
                isFocused && 'ring-1 ring-ring ring-inset',
                isSelected && 'bg-accent font-medium',
                isRegistry
                  ? 'text-muted-foreground hover:bg-accent/50'
                  : 'hover:bg-accent',
              )}
              style={{ paddingLeft: `${depth * 16 + 16}px` }}
              onClick={() => {
                kbNav.setFocusedId(node.id);
                onSelect(node.id);
              }}
            >
              {node.provenance && (
                <ProvenanceBar
                  provenance={node.provenance}
                  layerColors={layerColors}
                  layerVisibility={layerVisibility}
                />
              )}
              {node.provenance ? (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="contents">
                        {node.hasChildren ? (
                          <button
                            tabIndex={-1}
                            onClick={handleToggle}
                            className="p-0.5 hover:bg-muted rounded-sm"
                            aria-label={expanded ? 'Collapse' : 'Expand'}
                          >
                            {isLoading ? (
                              <Icon
                                path={mdiLoading}
                                className="h-3 w-3 animate-spin"
                              />
                            ) : (
                              <Icon
                                path={mdiChevronRight}
                                className={cn(
                                  'h-3 w-3 transition-transform',
                                  expanded && 'rotate-90',
                                )}
                              />
                            )}
                          </button>
                        ) : (
                          <span className="w-4" />
                        )}
                        <Icon
                          path={iconPath}
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            isRegistry
                              ? 'text-muted-foreground/50'
                              : 'text-muted-foreground',
                          )}
                        />
                        <span className={cn('truncate flex-1 min-w-0', isRegistry && 'italic')}>
                          {node.name}
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          {hasError && (
                            <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                          )}
                          <RowActionIcons
                            isRegistry={isRegistry}
                            onInsert={() => setIconInsertDialogOpen(true)}
                            onDuplicate={() => setDuplicateDialogOpen(true)}
                            onRefresh={handleRefresh}
                            onDelete={handleDelete}
                            isRefreshing={refreshItemMutation.isPending}
                          />
                        </div>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="start" className="text-xs">
                      <div className="space-y-0.5">
                        <div className="font-medium">Provenance</div>
                        {node.provenance.contributingLayers.map((name) => (
                          <div key={name}>
                            {name === node.provenance!.winnerLayer ? `${name} (winner)` : name}
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <>
                  {node.hasChildren ? (
                    <button
                      tabIndex={-1}
                      onClick={handleToggle}
                      className="p-0.5 hover:bg-muted rounded-sm"
                      aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                      {isLoading ? (
                        <Icon
                          path={mdiLoading}
                          className="h-3 w-3 animate-spin"
                        />
                      ) : (
                        <Icon
                          path={mdiChevronRight}
                          className={cn(
                            'h-3 w-3 transition-transform',
                            expanded && 'rotate-90',
                          )}
                        />
                      )}
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  <Icon
                    path={iconPath}
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isRegistry
                        ? 'text-muted-foreground/50'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span className={cn('truncate flex-1 min-w-0', isRegistry && 'italic')}>
                    {node.name}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    {hasError && (
                      <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                    )}
                    <RowActionIcons
                      isRegistry={isRegistry}
                      onInsert={() => setIconInsertDialogOpen(true)}
                      onDuplicate={() => setDuplicateDialogOpen(true)}
                      onRefresh={handleRefresh}
                      onDelete={handleDelete}
                      isRefreshing={refreshItemMutation.isPending}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {/* Insert - first item (Sitecore Content Editor parity). */}
          <ContextMenuSub onOpenChange={setInsertSubOpen}>
            <ContextMenuSubTrigger disabled={isRegistry && !isContentRoot && !isJssTenant}>
              Insert
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {insertOptionsQuery.isLoading && (
                <ContextMenuItem disabled>Loading...</ContextMenuItem>
              )}
              {visibleInsertOptions.map((opt) => (
                <ContextMenuItem
                  key={opt.templateId}
                  onSelect={() => setInsertDialog(opt)}
                >
                  {opt.templateName}
                </ContextMenuItem>
              ))}
              {isContentRoot && (
                <>
                  {visibleInsertOptions.length > 0 && <ContextMenuSeparator />}
                  <ContextMenuItem onSelect={() => setHeadlessTenantOpen(true)}>
                    Headless Site Collection
                  </ContextMenuItem>
                </>
              )}
              {isJssTenant && (
                <>
                  {visibleInsertOptions.length > 0 && <ContextMenuSeparator />}
                  <ContextMenuItem onSelect={() => setHeadlessSiteOpen(true)}>
                    Headless Site
                  </ContextMenuItem>
                </>
              )}
              {visibleInsertOptions.length > 0 && (
                <ContextMenuSeparator />
              )}
              <ContextMenuItem
                onSelect={() => setInsertFromTemplateDialogOpen(true)}
              >
                Insert from template...
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          {menuItems.length > 0 && (
            <>
              {menuItems.map((item) => (
                <ContextMenuItem
                  key={item.label}
                  onClick={() =>
                    setCreateDialog({ label: item.label, type: item.type })
                  }
                >
                  {item.label}
                </ContextMenuItem>
              ))}
            </>
          )}

          <ContextMenuSeparator />

          <ContextMenuItem
            disabled={isRegistry}
            onSelect={() => setDuplicateDialogOpen(true)}
          >
            Duplicate
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onClick={handleDelete}
          >
            Delete
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isRegistry}
            onSelect={() => setRenameDialogOpen(true)}
          >
            Rename
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={isRegistry}>
              Copying
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={() => setCopyDialogOpen(true)}>
                Copy to...
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => setMoveDialogOpen(true)}>
                Move to...
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            onClick={() => navigator.clipboard.writeText(node.id)}
          >
            Copy Item Id
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => navigator.clipboard.writeText(node.path)}
          >
            Copy Sitecore Path
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!node.filePath}
            onClick={() => {
              const folder = containingFolder(node.filePath);
              if (!folder) return;
              navigator.clipboard.writeText(folder);
              toast.success('Folder path copied');
            }}
          >
            Copy Folder Path
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={isRegistry}>
              Packaging
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={openAddToPackage}>
                Add to Package
              </ContextMenuItem>
              <ContextMenuItem onSelect={openDownloadTree}>
                Download Tree
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem
            onSelect={() => {
              // Focus the new tab on open. Spec decision #8 originally said
              // "doesn't change focus", but user smoke-test feedback flipped
              // this to focus-the-new-tab.
              workspaceStore.addTab(0, { selectedItemId: node.id });
            }}
          >
            Open in new tab
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isRegistry || refreshItemMutation.isPending}
            onSelect={handleRefresh}
          >
            Refresh
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {createDialog && (
        <CreateDialog
          open={!!createDialog}
          label={createDialog.label}
          parentPath={node.path}
          onConfirm={handleCreate}
          onClose={() => setCreateDialog(null)}
        />
      )}

      {insertDialog && (
        <InsertItemDialog
          open={!!insertDialog}
          templateName={insertDialog.templateName}
          parentPath={node.path}
          onConfirm={handleInsert}
          onClose={() => {
            setInsertDialog(null);
            setInsertServerError(null);
          }}
          isPending={insertItem.isPending}
          serverError={insertServerError}
        />
      )}

      {headlessTenantOpen && (
        <HeadlessSiteCollectionDialog
          open={headlessTenantOpen}
          onConfirm={handleScaffoldTenant}
          onClose={() => {
            setHeadlessTenantOpen(false);
            setHeadlessTenantServerError(null);
          }}
          isPending={headlessTenantPending}
          serverError={headlessTenantServerError}
        />
      )}

      {headlessSiteOpen && (
        <HeadlessSiteDialog
          open={headlessSiteOpen}
          onConfirm={handleScaffoldSite}
          onClose={() => {
            setHeadlessSiteOpen(false);
            setHeadlessSiteServerError(null);
          }}
          isPending={headlessSitePending}
          serverError={headlessSiteServerError}
        />
      )}

      {pendingScaffold && (
        <ScaffoldConfirmDialog
          open={pendingScaffold !== null}
          kind={pendingScaffold.kind}
          filePath={pendingScaffold.proposalFilePath}
          contents={pendingScaffold.proposalContents}
          coverageGaps={pendingScaffold.coverageGaps}
          onAccept={acceptScaffold}
          onCancel={cancelPendingScaffold}
          isPending={pendingScaffoldAccepting}
          serverError={pendingScaffoldServerError}
        />
      )}

      {duplicateDialogOpen && (
        <DuplicateItemDialog
          open={duplicateDialogOpen}
          sourceName={node.name}
          parentPath={parentPathOf(node.path)}
          siblings={siblingsForDuplicate}
          onConfirm={handleDuplicate}
          onClose={() => {
            setDuplicateDialogOpen(false);
            setDuplicateServerError(null);
          }}
          isPending={duplicateItem.isPending}
          serverError={duplicateServerError}
        />
      )}

      {copyDialogOpen && (
        <CopyMoveDestinationDialog
          open={copyDialogOpen}
          mode="copy"
          sourceId={node.id}
          sourceName={node.name}
          sourcePath={node.path}
          sourceDescendantIds={new Set()}
          sourceParentId={parentId ?? ''}
          sourceParentPath={parentPathOf(node.path)}
          database={database}
          onConfirm={handleCopyConfirm}
          onClose={() => {
            setCopyDialogOpen(false);
            setCopyServerError(null);
          }}
          isPending={copyItem.isPending}
          serverError={copyServerError}
        />
      )}

      {moveDialogOpen && (
        <CopyMoveDestinationDialog
          open={moveDialogOpen}
          mode="move"
          sourceId={node.id}
          sourceName={node.name}
          sourcePath={node.path}
          sourceDescendantIds={sourceDescendantIds}
          sourceParentId={parentId ?? ''}
          sourceParentPath={parentPathOf(node.path)}
          database={database}
          onConfirm={handleMoveConfirm}
          onClose={() => {
            setMoveDialogOpen(false);
            setMoveServerError(null);
          }}
          isPending={moveItem.isPending}
          serverError={moveServerError}
        />
      )}

      {renameDialogOpen && (
        <RenameItemDialog
          open={renameDialogOpen}
          currentName={node.name}
          parentPath={parentPathOf(node.path)}
          siblings={siblingsForRename}
          onConfirm={handleRenameConfirm}
          onClose={() => {
            setRenameDialogOpen(false);
            setRenameServerError(null);
          }}
          isPending={renameItemMutation.isPending}
          serverError={renameServerError}
        />
      )}

      {iconInsertDialogOpen && (
        <InsertDialogWithTemplateDropdown
          open={iconInsertDialogOpen}
          parentId={node.id}
          parentPath={node.path}
          siblings={siblingsForIconInsert}
          onConfirm={handleIconInsert}
          onClose={() => {
            setIconInsertDialogOpen(false);
            setIconInsertServerError(null);
          }}
          onNoOptions={() => {
            setIconInsertDialogOpen(false);
            setIconInsertServerError(null);
            setInsertFromTemplateDialogOpen(true);
          }}
          isPending={insertItem.isPending}
          serverError={iconInsertServerError}
        />
      )}

      {insertFromTemplateDialogOpen && (
        <InsertFromTemplateDialog
          open={insertFromTemplateDialogOpen}
          parentPath={node.path}
          siblings={siblingsForInsertFromTemplate}
          onConfirm={handleInsertFromTemplate}
          onClose={() => {
            setInsertFromTemplateDialogOpen(false);
            setInsertFromTemplateServerError(null);
          }}
          isPending={insertItem.isPending}
          serverError={insertFromTemplateServerError}
        />
      )}

      {deleteDialogOpen && (
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          itemName={node.name}
          itemPath={node.path}
          hasChildren={node.hasChildren}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteDialogOpen(false)}
          isPending={deleteItem.isPending}
        />
      )}

      {packageDialogOpen && (
        <AddToPackageDialog
          item={{ id: node.id, path: node.path, name: node.name }}
          open={packageDialogOpen}
          onOpenChange={setPackageDialogOpen}
          mode={packageDialogMode}
          onDownloadSuccess={(filename) => toast.success(`Downloaded ${filename}`)}
          onDownloadError={(message) => toast.error(message)}
        />
      )}

      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <ContentTreeNode
              key={`${child.id}-${collapseKey}`}
              node={child}
              parentId={node.id}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
              collapseKey={collapseKey}
              validationErrors={validationErrors}
              database={database}
              autoExpandIds={autoExpandIds}
              layerColors={layerColors}
              layerVisibility={layerVisibility}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ---- filter helper ----

function filterNode(node: TreeNode, query: string): TreeNode | null {
  const nameMatches = node.name.toLowerCase().includes(query);
  const children = node.children ?? [];
  const filteredChildren = children
    .map((child) => filterNode(child, query))
    .filter(Boolean) as TreeNode[];
  if (nameMatches || filteredChildren.length > 0) {
    return { ...node, children: nameMatches ? children : filteredChildren };
  }
  return null;
}

// ---- top-level ContentTree ----

export interface ContentTreeProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  database: string;
}

export function ContentTree({ selectedId, onSelect, database }: ContentTreeProps) {
  const tabId = useTabId();
  const { data: status } = useEngineStatus();
  const { data: tree, isLoading } = useTree(database);
  const { data: validation } = useValidation();
  const { data: ancestors } = useAncestors(selectedId);
  const [search, setSearch] = useState('');
  const [collapseKey, setCollapseKey] = useState(0);

  // Set of ancestor IDs that should auto-expand so the selected node becomes
  // visible in the tree. Recomputed when the ancestor chain changes; child
  // nodes pick it up via their useEffect and call setExpanded(true).
  const autoExpandIds = useMemo(
    () => new Set(ancestors ?? []),
    [ancestors],
  );

  const errorItemIds = useMemo(() => {
    // Belt-and-braces: even if the validation query is fixed, defend against
    // a malformed shape sneaking in via cache, stale state, or a future caller
    // that doesn't validate. `errors` must be an array for filter() to work.
    if (!validation || !Array.isArray(validation.errors)) return new Set<string>();
    return new Set(
      validation.errors.filter((e) => e.itemId).map((e) => e.itemId!),
    );
  }, [validation]);

  // Keyboard navigation. Focus is distinct from selection: arrow keys move
  // focus only; Enter/Space (or click) commits selection by calling onSelect.
  // ContentTreeNode owns per-node expanded state, so onExpand/onCollapse
  // bridge to ContentTreeNode via a CustomEvent dispatched on the container,
  // which each node listens for on its closest [role="tree"] ancestor.
  const containerEl = useRef<HTMLElement | null>(null);
  const dispatchNodeIntent = useCallback(
    (kind: 'expand' | 'collapse', id: string) => {
      if (!containerEl.current) return;
      containerEl.current.dispatchEvent(
        new CustomEvent('tree-keyboard-intent', {
          detail: { kind, id },
          bubbles: false,
        }),
      );
    },
    [],
  );

  const kbNav = useTreeKeyboardNav({
    initialFocusedId: selectedId,
    onActivate: (id) => onSelect(id),
    onExpand: (id) => dispatchNodeIntent('expand', id),
    onCollapse: (id) => dispatchNodeIntent('collapse', id),
  });

  // External selectedId change: keep keyboard cursor on the latest selection.
  useEffect(() => {
    kbNav.setFocusedId(selectedId);
    // We intentionally do NOT include kbNav in the deps array - setFocusedId
    // is stable across renders via useCallback, and including the whole hook
    // return object would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Belt-and-braces: explicit focus reset on collapseKey increments.
  // The hook's layout effect already resets focusedId when the row leaves
  // the DOM, but doing this ahead of the next render avoids a flash of
  // stale focus during the collapse-all transition.
  useEffect(() => {
    kbNav.setFocusedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseKey]);

  const filteredTree = useMemo(() => {
    if (!tree || !search) return tree;
    return tree
      .map((node) => filterNode(node, search.toLowerCase()))
      .filter(Boolean) as TreeNode[];
  }, [tree, search]);

  const layerVisibility = useLayerState((s) => s.visibility);
  const layerOverrides = useLayerState((s) => s.overrides);

  const layerColorsByName = useMemo(() => {
    const m: Record<string, string> = { ootb: '#9ca3af' };
    for (const l of status?.layers ?? []) {
      if (l.name === 'ootb') continue;
      m[l.name] = (layerOverrides[l.name]?.color ?? l.color ?? '#888888') as string;
    }
    return m;
  }, [status?.layers, layerOverrides]);

  const layerVisMap = useMemo(() => {
    const m: Record<string, boolean> = { ootb: true };
    for (const l of status?.layers ?? []) {
      if (l.name === 'ootb') continue;
      m[l.name] = layerVisibility[l.name] !== false;
    }
    return m;
  }, [status?.layers, layerVisibility]);

  const visibleByLayerTree = useMemo(() => {
    if (!filteredTree) return filteredTree;
    function filterByLayer(node: TreeNode): TreeNode | null {
      const winner = node.provenance?.winnerLayer;
      const allowSelf = !winner || layerVisMap[winner] !== false;
      const children = (node.children ?? [])
        .map(filterByLayer)
        .filter(Boolean) as TreeNode[];
      if (!allowSelf && children.length === 0) return null;
      return { ...node, children };
    }
    return filteredTree.map(filterByLayer).filter(Boolean) as TreeNode[];
  }, [filteredTree, layerVisMap]);

  const collapseAll = useCallback(() => {
    workspaceStore.patchTab(tabId, { expandedNodes: new Map() });
    setCollapseKey((k) => k + 1);
  }, [tabId]);

  if (status?.state === 'no-project') {
    return <NoProjectState />;
  }

  if (status?.state !== 'ready' || isLoading) {
    const indexing = (status?.state as string) === 'indexing';
    const p = status?.progress;
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <Icon path={mdiLoading} className="h-6 w-6 animate-spin" />
        <span className="text-sm">
          {indexing && p
            ? `Indexing ${p.scanned.toLocaleString()} / ${p.total.toLocaleString()} items...`
            : indexing
              ? 'Indexing items...'
              : 'Loading content tree...'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex gap-1">
        <div className="relative flex-1">
          <Icon
            path={mdiMagnify}
            className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                // Jump focus into the tree: focus the first visible row.
                const container = containerEl.current;
                if (!container) return;
                const firstRow = container.querySelector<HTMLElement>(
                  '[data-tree-row-id]',
                );
                if (firstRow) {
                  e.preventDefault();
                  const id = firstRow.dataset.treeRowId!;
                  kbNav.setFocusedId(id);
                }
              } else if (e.key === 'Escape') {
                if (search !== '') {
                  e.preventDefault();
                  setSearch('');
                }
              }
            }}
            className="w-full rounded-md border bg-background py-1 pl-8 pr-2 text-sm"
          />
        </div>
        <button
          onClick={collapseAll}
          className="rounded-md border p-1 hover:bg-accent"
          title="Collapse all"
        >
          <Icon
            path={mdiUnfoldLessHorizontal}
            className="h-4 w-4 text-muted-foreground"
          />
        </button>
      </div>
      <div
        {...kbNav.containerProps}
        ref={(el) => {
          containerEl.current = el;
          kbNav.containerProps.ref(el);
        }}
        className="flex-1 overflow-auto p-1"
        aria-label="Content tree"
      >
        <TreeKeyboardNavProvider value={kbNav}>
          {visibleByLayerTree?.map((node) => (
            <ContentTreeNode
              key={`${node.id}-${collapseKey}`}
              node={node}
              parentId={null}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={0}
              collapseKey={collapseKey}
              validationErrors={errorItemIds}
              database={database}
              autoExpandIds={autoExpandIds}
              layerColors={layerColorsByName}
              layerVisibility={layerVisMap}
            />
          ))}
        </TreeKeyboardNavProvider>
      </div>
      <LayerLegend
        layers={(status?.layers ?? []).filter((l) => l.name !== 'ootb').map((l) => ({
          name: layerOverrides[l.name]?.name ?? l.name,
          color: layerOverrides[l.name]?.color ?? l.color ?? '#888888',
        }))}
        layerVisibility={layerVisMap}
      />
    </div>
  );
}
