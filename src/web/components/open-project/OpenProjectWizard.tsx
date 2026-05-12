import { useState } from 'react';
import { toast } from 'sonner';
import { FolderBrowser } from './FolderBrowser';
import { LayerSelectionDialog } from './LayerSelectionDialog';
import { useDiscoverLayers } from '@/hooks/useDiscoverLayers';
import { useOpenProject } from '@/hooks/useOpenProject';

interface OpenProjectWizardProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'folder' | 'layers';

/**
 * Two-step wizard: pick a folder, then pick which discovered sitecore.json
 * files to load as layers. On success, the engine state transitions from
 * 'no-project' to 'ready' via /api/projects/open; the parent component
 * (NoProjectState) closes us and the existing status-polling drives the
 * tree view to re-render.
 */
export function OpenProjectWizard({ open, onClose }: OpenProjectWizardProps) {
  const [step, setStep] = useState<Step>('folder');
  const [rootPath, setRootPath] = useState<string>('/');
  const discover = useDiscoverLayers();
  const openProject = useOpenProject();

  const reset = () => {
    setStep('folder');
    setRootPath('/');
    discover.reset();
    openProject.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFolderConfirm = async (path: string) => {
    setRootPath(path);
    try {
      const result = await discover.mutateAsync({ path });
      if (result.candidates.length === 0) {
        toast.error('No sitecore.json files found in that folder.');
        return;
      }
      setStep('layers');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan folder');
    }
  };

  const handleLayersConfirm = async (
    layers: { sitecoreJsonPath: string; name: string; color?: string }[],
  ) => {
    try {
      await openProject.mutateAsync({ layers });
      toast.success('Project opened.');
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open project');
    }
  };

  if (!open) return null;

  if (step === 'folder') {
    return (
      <FolderBrowser
        open={open}
        onClose={handleClose}
        onConfirm={handleFolderConfirm}
      />
    );
  }

  return (
    <LayerSelectionDialog
      open={open}
      rootPath={rootPath}
      candidates={discover.data?.candidates ?? []}
      onClose={handleClose}
      onConfirm={handleLayersConfirm}
      isPending={openProject.isPending}
      serverError={openProject.error?.message ?? null}
    />
  );
}
