import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import {
  mdiClose,
  mdiDotsVertical,
  mdiFolderArrowRight,
  mdiLayers,
  mdiPlus,
} from '@mdi/js';
import { useQueryClient } from '@tanstack/react-query';
import { useLayerState } from '@/state/layerState';
import { LayerRow } from './LayerRow';
import { EditableLayerName } from './EditableLayerName';
import { LayerSourcePicker } from './LayerSourcePicker';
import { LayerCollisionDialog } from './LayerCollisionDialog';
import { useProjectsStore, type SavedProjectLayer } from '@/state/projectsStore';
import { useCurrentProjectHash } from '@/hooks/useCurrentProjectHash';
import { useReopenWithLayers } from '@/hooks/useReopenWithLayers';
import { deriveName } from '@/components/open-project/layer-name';
import { assignLayerColor } from '@/components/open-project/layer-colors';
import { useConfirmDiscardWorkspace } from '@/components/workspace/useConfirmDiscardWorkspace';
import { ConfirmDiscardWorkspaceDialog } from '@/components/workspace/ConfirmDiscardWorkspaceDialog';

interface SidebarLayer {
  name: string;
  sitecoreJsonPath?: string;
  color?: string;
  effectiveCount: number;
}

interface SidebarStatus {
  state: 'ready' | 'no-project' | 'indexing' | 'error' | 'init' | 'initializing';
  layers: SidebarLayer[];
  projectName?: string | null;
}

interface ProjectSidebarProps {
  status: SidebarStatus;
  onSwitch: () => void;
  onClose: () => void;
}

const OOTB_GREY = '#cbd5e1';
const STORAGE_KEY = 'mockingbird.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore storage errors in restricted environments
  }
}

export function ProjectSidebar({ status, onSwitch, onClose }: ProjectSidebarProps) {
  const { isVisible, setVisibility, rename, recolor, overrides } = useLayerState();
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [replaceTargetIndex, setReplaceTargetIndex] = useState<number | null>(null);
  const [collidingProjectName, setCollidingProjectName] = useState<string | null>(null);
  const [pendingMutation, setPendingMutation] = useState<{
    oldHash: string;
    nextLayers: SavedProjectLayer[];
    projectName: string;
    collidingHash: string;
  } | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const reopen = useReopenWithLayers();
  const discardWorkspaceGate = useConfirmDiscardWorkspace();

  const lastOpenedHash = useCurrentProjectHash();
  const projects = useProjectsStore((s) => s.projects);
  const renameProject = useProjectsStore((s) => s.rename);

  const proposeReopen = async (
    oldHash: string,
    nextLayers: SavedProjectLayer[],
    projectName: string,
  ) => {
    const { collidingHash } = await reopen.detectCollision({ oldHash, nextLayers });
    if (collidingHash) {
      const collidingProject = projects[collidingHash];
      setCollidingProjectName(collidingProject?.name ?? collidingHash);
      setPendingMutation({ oldHash, nextLayers, projectName, collidingHash });
      return;
    }
    discardWorkspaceGate.request('switch', () => {
      reopen.mutate({ oldHash, nextLayers, projectName });
    });
  };

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [actionsMenuOpen]);

  if (status.state === 'no-project') return null;
  if (!status.layers || status.layers.length === 0) return null;

  const userLayers = status.layers.filter((l) => l.name !== 'ootb');
  if (userLayers.length === 0) return null;

  const ootbCount =
    status.layers.find((l) => l.name === 'ootb')?.effectiveCount ?? 0;

  const firstPath = userLayers[0]?.sitecoreJsonPath ?? '';
  const projectPath = firstPath.replace(/\/[^/]+\/[^/]+$/, '');
  const pathDerivedLabel = projectPath.split('/').filter(Boolean).pop() ?? 'project';
  const projectLabel = (status.projectName?.trim() || null) ?? pathDerivedLabel;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  };

  const handleProjectRename = (newName: string) => {
    if (!lastOpenedHash) return;
    const existing = projects[lastOpenedHash];
    if (!existing) return;
    renameProject(lastOpenedHash, newName);
  };

  if (collapsed) {
    return (
      <aside
        data-testid="sidebar-collapsed"
        className="w-8 border-l bg-card flex flex-col items-center py-2 h-full shrink-0"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCollapsed}
          aria-label="Show content layers"
          title="Content Layers"
          className="p-0 size-6"
        >
          <Icon path={mdiLayers} className="size-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="w-72 border-l bg-card flex flex-col h-full shrink-0">
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2 h-9">
        <div className="min-w-0 overflow-hidden flex-1">
          <div className="font-semibold text-sm truncate">
            <EditableLayerName value={projectLabel} onChange={handleProjectRename} />
          </div>
          <div className="font-mono text-[10px] text-muted-foreground truncate" title={projectPath}>
            {projectPath}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative" ref={actionsMenuRef}>
            <button
              type="button"
              aria-label="Project actions"
              title="Project actions"
              onClick={() => setActionsMenuOpen((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon path={mdiDotsVertical} className="size-4" />
            </button>
            {actionsMenuOpen && (
              <div className="absolute right-0 z-30 mt-1 w-44 rounded border bg-popover shadow-md text-sm py-1">
                <button
                  type="button"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    onSwitch();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
                >
                  <Icon path={mdiFolderArrowRight} className="size-4 text-muted-foreground" />
                  Open another project...
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent text-left text-danger-fg"
                >
                  <Icon path={mdiClose} className="size-4" />
                  Close project
                </button>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            aria-label="Hide content layers"
            title="Content Layers"
            className="p-0 size-6"
          >
            <Icon path={mdiLayers} className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Content Layers
        </div>
        {userLayers.map((layer, idx) => {
          const override = overrides[layer.name] ?? {};
          return (
            <LayerRow
              key={layer.name}
              layerName={override.name ?? layer.name}
              effectiveCount={layer.effectiveCount}
              color={override.color ?? layer.color ?? '#888888'}
              visible={isVisible(layer.name)}
              titleHint={layer.sitecoreJsonPath}
              onToggle={(v) => setVisibility(layer.name, v)}
              onRename={(n) => rename(layer.name, n)}
              onRecolor={(c) => recolor(layer.name, c)}
              onReplaceSource={() => setReplaceTargetIndex(idx)}
              onRemove={() => {
                if (!lastOpenedHash) return;
                const project = projects[lastOpenedHash];
                if (!project) return;
                const nextLayers = project.layers.filter((_, i) => i !== idx);
                void proposeReopen(lastOpenedHash, nextLayers, project.name);
              }}
              canRemove={userLayers.length > 1}
            />
          );
        })}
        <div className="px-3 pt-1 pb-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1 rounded border border-dashed hover:bg-accent/40"
          >
            <Icon path={mdiPlus} className="size-3" />
            Add layer
          </button>
        </div>
        <LayerRow
          layerName="Sitecore IAR"
          effectiveCount={ootbCount}
          color={OOTB_GREY}
          visible={true}
          ootbSubstrate
          onToggle={() => {}}
          onRename={() => {}}
          onRecolor={() => {}}
        />
      </div>
      <LayerSourcePicker
        open={addOpen}
        mode="add"
        existingPaths={userLayers
          .map((l) => l.sitecoreJsonPath)
          .filter((p): p is string => typeof p === 'string')}
        onConfirm={(filePath) => {
          setAddOpen(false);
          if (!lastOpenedHash) return;
          const existing = projects[lastOpenedHash];
          if (!existing) return;
          const nextLayers = [
            ...existing.layers,
            {
              sitecoreJsonPath: filePath,
              name: deriveName(filePath),
              color: assignLayerColor(existing.layers.length),
            },
          ];
          void proposeReopen(lastOpenedHash, nextLayers, existing.name);
        }}
        onCancel={() => setAddOpen(false)}
      />
      {replaceTargetIndex !== null && (
        <LayerSourcePicker
          open
          mode="replace"
          currentPath={
            lastOpenedHash
              ? projects[lastOpenedHash]?.layers[replaceTargetIndex]?.sitecoreJsonPath
              : undefined
          }
          existingPaths={
            lastOpenedHash
              ? (projects[lastOpenedHash]?.layers.map((l) => l.sitecoreJsonPath) ?? [])
              : []
          }
          onConfirm={(filePath) => {
            if (!lastOpenedHash) return;
            const project = projects[lastOpenedHash];
            if (!project) return;
            const targetIndex = replaceTargetIndex;
            if (targetIndex === null) return;
            const nextLayers = project.layers.map((l, i) =>
              i === targetIndex ? { ...l, sitecoreJsonPath: filePath } : l,
            );
            setReplaceTargetIndex(null);
            void proposeReopen(lastOpenedHash, nextLayers, project.name);
          }}
          onCancel={() => setReplaceTargetIndex(null)}
        />
      )}
      <ConfirmDiscardWorkspaceDialog
        action={discardWorkspaceGate.pendingAction}
        dirtyCount={discardWorkspaceGate.pendingDirtyCount}
        onConfirm={discardWorkspaceGate.onConfirm}
        onCancel={discardWorkspaceGate.onCancel}
      />
      <LayerCollisionDialog
        collidingProjectName={collidingProjectName}
        onSwitch={() => {
          if (!pendingMutation) return;
          qc.invalidateQueries({ queryKey: ['config', 'mockingbird'] });
          setCollidingProjectName(null);
          setPendingMutation(null);
          // NoProjectState's auto-restore + hydrator will open the existing
          // project on the next status tick.
        }}
        onCancel={() => {
          setCollidingProjectName(null);
          setPendingMutation(null);
        }}
      />
    </aside>
  );
}
