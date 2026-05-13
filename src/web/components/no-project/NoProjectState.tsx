import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiFolderOpen } from '@mdi/js';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-states';
import { FirstRunChooser } from '@/components/open-project/FirstRunChooser';
import { OpenProjectWizard } from '@/components/open-project/OpenProjectWizard';
import { useRecents, useRemoveRecent, type RecentEntry } from '@/hooks/useRecents';
import { useLastSession } from '@/hooks/useLastSession';
import { usePrefs } from '@/hooks/usePrefs';
import { useOpenProject } from '@/hooks/useOpenProject';
import { RecentsSection } from './RecentsSection';

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

  const { data: recentsData } = useRecents();
  const { data: lastSession } = useLastSession();
  const { data: prefs } = usePrefs();
  const removeRecent = useRemoveRecent();
  const openProject = useOpenProject();

  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restoreAttempted = useRef(false);

  // Auto-restore on mount: fires once when prefs is true AND lastSession is non-null.
  useEffect(() => {
    if (restoreAttempted.current) return;
    if (!prefs || !lastSession) return;
    if (!prefs.autoRestoreLastSession) return;
    restoreAttempted.current = true;

    (async () => {
      try {
        const res = await fetch(
          `/api/profiles/${encodeURIComponent(lastSession.projectHash)}/${encodeURIComponent(lastSession.profileName)}`,
        );
        if (!res.ok) {
          setRestoreError('Last session profile is missing.');
          return;
        }
        const { profile } = await res.json();
        openProject.mutate({
          layers: profile.layers,
          projectName: profile.projectName,
          profileName: profile.name,
        });
      } catch (err) {
        setRestoreError(err instanceof Error ? err.message : 'Could not restore last session.');
      }
    })();
  }, [prefs, lastSession, openProject.mutate]);

  const handleOpenFromRecent = (entry: RecentEntry) => {
    (async () => {
      try {
        const res = await fetch(
          `/api/profiles/${encodeURIComponent(entry.projectHash)}/${encodeURIComponent(entry.profileName)}`,
        );
        if (!res.ok) {
          setRestoreError(`Profile "${entry.profileName}" could not be opened.`);
          return;
        }
        const { profile } = await res.json();
        setRestoreError(null);
        openProject.mutate({
          layers: profile.layers,
          projectName: profile.projectName,
          profileName: profile.name,
        });
      } catch (err) {
        setRestoreError(err instanceof Error ? err.message : 'Could not open profile.');
      }
    })();
  };

  const handleRemoveRecent = (entry: RecentEntry) => {
    removeRecent.mutate({ projectHash: entry.projectHash, profileName: entry.profileName });
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
          Pick a folder under /workspaces to scan for sitecore.json files, then
          choose which layers to load. OOTB Sitecore items remain visible at all
          times.
        </p>
      </div>
      <Button onClick={handleOpenClick}>Open a project</Button>

      {restoreError && (
        <p className="text-xs text-destructive">{restoreError}</p>
      )}
      <RecentsSection
        entries={recentsData?.entries ?? []}
        onOpen={handleOpenFromRecent}
        onRemove={handleRemoveRecent}
      />

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
        <OpenProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} initialMode="first-run" />
      )}
    </EmptyState>
  );
}
