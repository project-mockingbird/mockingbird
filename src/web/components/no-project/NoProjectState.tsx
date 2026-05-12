import { useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiFolderOpen } from '@mdi/js';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-states';
import { FirstRunChooser } from '@/components/open-project/FirstRunChooser';
import { OpenProjectWizard } from '@/components/open-project/OpenProjectWizard';

interface NoProjectStateProps {
  /**
   * Optional callback fired when the user clicks "Open a project". Provided
   * for backwards compatibility with the Task 2 wiring; the internal chooser
   * + wizard run regardless.
   */
  onOpenProject?: () => void;
}

/**
 * Empty-state placeholder rendered by ContentTree.tsx when /api/status reports
 * state: 'no-project'. Owns the wizard state machine: button -> chooser ->
 * (folder browse -> layer select -> POST /api/projects/open) -> close.
 */
export function NoProjectState({ onOpenProject }: NoProjectStateProps) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleOpenClick = () => {
    onOpenProject?.();
    setChooserOpen(true);
  };

  return (
    <EmptyState>
      <Icon path={mdiFolderOpen} className="size-12 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-lg font-medium">No project loaded</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Pick a folder under /workspaces to scan for sitecore.json files, then
          choose which layers to load. OOTB Sitecore items remain visible at all
          times.
        </p>
      </div>
      <Button onClick={handleOpenClick}>Open a project</Button>

      <FirstRunChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onOpenExisting={() => {
          setChooserOpen(false);
          setWizardOpen(true);
        }}
        onBrowseOotbOnly={() => setChooserOpen(false)}
      />
      {wizardOpen && (
        <OpenProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      )}
    </EmptyState>
  );
}
