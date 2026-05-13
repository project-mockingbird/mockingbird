import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiFolderOpen } from '@mdi/js';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-states';
import { FirstRunChooser } from '@/components/open-project/FirstRunChooser';
import { OpenProjectWizard } from '@/components/open-project/OpenProjectWizard';
import { useOpenProject } from '@/hooks/useOpenProject';
import { useProjectsStore, type SavedProject } from '@/state/projectsStore';

interface NoProjectStateProps {
  onOpenProject?: () => void;
}

/**
 * Empty-state placeholder rendered by ContentTree.tsx when /api/status reports
 * state: 'no-project'. Owns the chooser dialog + wizard. State (saved projects,
 * last session, auto-restore prefs) lives in localStorage via projectsStore.
 */
export function NoProjectState({ onOpenProject }: NoProjectStateProps) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const projectsMap = useProjectsStore((s) => s.projects);
  const lastOpenedHash = useProjectsStore((s) => s.lastOpenedHash);
  const autoRestore = useProjectsStore((s) => s.prefs.autoRestore);
  const touchLastOpened = useProjectsStore((s) => s.touchLastOpened);
  const openProject = useOpenProject();
  const hasSavedProjects = Object.keys(projectsMap).length > 0;

  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restoreAttempted = useRef(false);

  // Auto-restore on mount: fires once when the pref is on AND there is a last
  // opened project in localStorage.
  useEffect(() => {
    if (restoreAttempted.current) return;
    if (!autoRestore) return;
    if (!lastOpenedHash) return;
    const project = useProjectsStore.getState().get(lastOpenedHash);
    if (!project) return;
    restoreAttempted.current = true;
    openProject.mutate(
      { layers: project.layers, projectName: project.name },
      {
        onSuccess: () => touchLastOpened(project.hash),
        onError: (err) =>
          setRestoreError(err instanceof Error ? err.message : 'Could not restore last project.'),
      },
    );
  }, [autoRestore, lastOpenedHash, openProject, touchLastOpened]);

  const handleOpenSaved = (project: SavedProject) => {
    setRestoreError(null);
    setChooserOpen(false);
    openProject.mutate(
      { layers: project.layers, projectName: project.name },
      {
        onSuccess: () => touchLastOpened(project.hash),
        onError: (err) =>
          setRestoreError(err instanceof Error ? err.message : 'Could not open project.'),
      },
    );
  };

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
          {hasSavedProjects
            ? 'Open one of your saved projects, or create a new one.'
            : 'Point Mockingbird at a folder with sitecore.json files to get started.'}
        </p>
      </div>
      <Button onClick={handleOpenClick}>Get started</Button>

      {restoreError && (
        <p className="text-xs text-destructive">{restoreError}</p>
      )}

      <FirstRunChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onCreateNew={() => {
          setChooserOpen(false);
          setWizardOpen(true);
        }}
        onOpenExisting={handleOpenSaved}
      />
      {wizardOpen && (
        <OpenProjectWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          initialMode="first-run"
        />
      )}
    </EmptyState>
  );
}
