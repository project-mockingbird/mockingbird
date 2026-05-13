import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import { mdiFolderArrowRight, mdiClose, mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import { useLayerState } from '@/state/layerState';
import { LayerRow } from './LayerRow';
import { ProfileDropdown } from './ProfileDropdown';
import { useProfiles, useUpsertProfile } from '@/hooks/useProfiles';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import { useCloseProject } from '@/hooks/useCloseProject';
import { useOpenProject } from '@/hooks/useOpenProject';

interface SidebarLayer {
  name: string;
  sitecoreJsonPath?: string;
  color?: string;
  effectiveCount: number;
}

interface SidebarStatus {
  state: 'ready' | 'no-project' | 'indexing' | 'error' | 'init' | 'initializing';
  layers: SidebarLayer[];
  registryItemCount?: number;
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

  if (status.state === 'no-project') return null;
  if (!status.layers || status.layers.length === 0) return null;

  // Separate user layers from the synthetic ootb row (the API already adds it).
  const userLayers = status.layers.filter((l) => l.name !== 'ootb');
  if (userLayers.length === 0) return null;

  const ootbCount =
    status.layers.find((l) => l.name === 'ootb')?.effectiveCount ?? status.registryItemCount ?? 0;

  // Compute a short project label. Prefer the API-supplied projectName (set
  // at open-project time). Fall back to the path-strip heuristic.
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

  const engineStatus = useEngineStatus();
  const activeProfile = engineStatus.data?.activeProfile ?? null;
  const profilesQuery = useProfiles(activeProfile?.projectHash ?? null);
  const profiles = profilesQuery.data?.profiles ?? [];

  const openProject = useOpenProject();
  const closeProject = useCloseProject();
  const upsertProfile = useUpsertProfile();

  const handleSave = () => {
    if (!activeProfile) return;
    upsertProfile.mutate({
      projectHash: activeProfile.projectHash,
      name: activeProfile.profileName,
      projectName: status.projectName ?? 'project',
      layers: userLayers.map((l) => ({
        sitecoreJsonPath: l.sitecoreJsonPath ?? '',
        name: l.name,
        color: l.color ?? '#888888',
      })),
    });
  };

  const handleSaveAs = () => {
    // Real wiring lands in Task 10 (SettingsPopover + ManageProfilesModal cycle includes a Save As prompt).
  };

  const handleSwitch = async (profileName: string) => {
    if (!activeProfile) return;
    try {
      const res = await fetch(
        `/api/profiles/${encodeURIComponent(activeProfile.projectHash)}/${encodeURIComponent(profileName)}`,
      );
      if (!res.ok) return;
      const { profile } = await res.json();
      await closeProject.mutateAsync();
      await openProject.mutateAsync({
        layers: profile.layers.map((l: { sitecoreJsonPath: string; name: string; color: string }) => ({
          sitecoreJsonPath: l.sitecoreJsonPath,
          name: l.name,
          color: l.color,
        })),
        projectName: profile.projectName,
        profileName: profile.name,
      });
    } catch {
      // Toast layer (existing) surfaces fetch failures; no-op locally.
    }
  };

  const handleManage = () => {
    // Wired in Task 10.
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
          aria-label="Expand sidebar"
          className="p-0 size-6"
        >
          <Icon path={mdiChevronLeft} className="size-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="w-72 border-l bg-card flex flex-col h-full shrink-0">
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2 h-9 overflow-hidden">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{projectLabel}</div>
          <div className="font-mono text-[10px] text-muted-foreground truncate" title={projectPath}>
            {projectPath}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar"
          className="p-0 size-6 shrink-0"
        >
          <Icon path={mdiChevronRight} className="size-4" />
        </Button>
      </div>
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Profile</span>
        <div className="flex-1 min-w-0">
          <ProfileDropdown
            activeName={activeProfile?.profileName ?? null}
            profiles={profiles}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onSwitch={handleSwitch}
            onManage={handleManage}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Content Layers
        </div>
        {userLayers.map((layer) => {
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
            />
          );
        })}
        <LayerRow
          layerName="OOTB Sitecore"
          effectiveCount={ootbCount}
          color={OOTB_GREY}
          visible={true}
          ootbSubstrate
          onToggle={() => {}}
          onRename={() => {}}
          onRecolor={() => {}}
        />
      </div>
      <div className="border-t p-2 flex flex-col gap-1">
        <Button variant="outline" size="sm" onClick={onSwitch} className="justify-start">
          <Icon path={mdiFolderArrowRight} className="size-4 mr-2" /> Switch project
        </Button>
        <Button variant="default" colorScheme="danger" size="sm" onClick={onClose} className="justify-start">
          <Icon path={mdiClose} className="size-4 mr-2" /> Close project
        </Button>
      </div>
    </aside>
  );
}
