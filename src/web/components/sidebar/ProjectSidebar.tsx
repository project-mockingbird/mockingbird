import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import { mdiFolderArrowRight, mdiClose } from '@mdi/js';
import { useLayerState } from '@/state/layerState';
import { LayerRow } from './LayerRow';

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
}

interface ProjectSidebarProps {
  status: SidebarStatus;
  onSwitch: () => void;
  onClose: () => void;
}

const OOTB_GREY = '#9ca3af';

export function ProjectSidebar({ status, onSwitch, onClose }: ProjectSidebarProps) {
  const { isVisible, setVisibility, rename, recolor, overrides } = useLayerState();

  if (status.state === 'no-project') return null;
  if (!status.layers || status.layers.length === 0) return null;

  // Separate user layers from the synthetic ootb row (the API already adds it).
  const userLayers = status.layers.filter((l) => l.name !== 'ootb');
  if (userLayers.length === 0) return null;

  const ootbCount =
    status.layers.find((l) => l.name === 'ootb')?.effectiveCount ?? status.registryItemCount ?? 0;

  // Compute a short project label - each layer sits at <project>/<layer>/sitecore.json,
  // so strip two path segments to get the project root.
  const firstPath = userLayers[0]?.sitecoreJsonPath ?? '';
  const projectPath = firstPath.replace(/\/[^/]+\/[^/]+$/, '');
  const projectLabel = projectPath.split('/').filter(Boolean).pop() ?? 'project';

  return (
    <aside className="w-72 border-l bg-card flex flex-col h-full shrink-0">
      <div className="px-3 py-2 border-b">
        <div className="font-semibold text-sm">{projectLabel}</div>
        <div className="font-mono text-[10px] text-muted-foreground truncate" title={projectPath}>
          {projectPath}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Layers
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
