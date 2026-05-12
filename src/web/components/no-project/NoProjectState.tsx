import { Icon } from '@/lib/icon';
import { mdiFolderOpen } from '@mdi/js';
import { Button } from '@/components/ui/button';

interface NoProjectStateProps {
  onOpenProject: () => void;
}

/**
 * Empty-state placeholder rendered by ContentTree.tsx when /api/status reports
 * state: 'no-project'. Replaces the indefinite loading spinner that previously
 * showed for the same state. The CTA delegates to the parent which owns the
 * wizard state machine.
 */
export function NoProjectState({ onOpenProject }: NoProjectStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Icon path={mdiFolderOpen} className="size-12 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-lg font-medium">No project loaded</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Pick a folder under /workspaces to scan for sitecore.json files, then
          choose which layers to load. OOTB Sitecore items remain visible at all
          times.
        </p>
      </div>
      <Button onClick={onOpenProject}>Open a project</Button>
    </div>
  );
}
