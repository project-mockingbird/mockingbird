import { useState } from 'react';
import { toast } from 'sonner';
import { FolderBrowser } from './FolderBrowser';
import { LayerSelectionDialog } from './LayerSelectionDialog';
import { useOpenProject } from '@/hooks/useOpenProject';

interface OpenProjectWizardProps {
  open: boolean;
  onClose: () => void;
  /**
   * 'first-run' (default): used by NoProjectState's chooser path.
   * 'switch': used by ProjectSidebar's Switch button. Behavior is identical
   * today; the prop is reserved for future divergence (e.g. preserving
   * picked-layer history across opens).
   */
  initialMode?: 'first-run' | 'switch';
}

type Step = 'folder' | 'layers';

interface PickedLayer {
  sitecoreJsonPath: string;
  moduleCount: number;
  pushOpsSummary: string;
}

/**
 * Two-step wizard: pick a sitecore.json file (or any SCS root-config-shaped
 * JSON), then confirm + open. Multi-layer is progressive via the dialog's
 * "Add another layer" button which returns the wizard to the folder step.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function OpenProjectWizard({ open, onClose, initialMode = 'first-run' }: OpenProjectWizardProps) {
  const [step, setStep] = useState<Step>('folder');
  const [pickedLayers, setPickedLayers] = useState<PickedLayer[]>([]);
  const openProject = useOpenProject();

  const reset = () => {
    setStep('folder');
    setPickedLayers([]);
    openProject.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFilePick = (
    filePath: string,
    moduleCount: number,
    pushOpsSummary: string,
  ) => {
    if (pickedLayers.some((l) => l.sitecoreJsonPath === filePath)) {
      toast.warning('That layer is already added.');
      return;
    }
    setPickedLayers((prev) => [
      ...prev,
      { sitecoreJsonPath: filePath, moduleCount, pushOpsSummary },
    ]);
    setStep('layers');
  };

  const handleAddAnother = () => {
    setStep('folder');
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
        onFilePick={handleFilePick}
      />
    );
  }

  return (
    <LayerSelectionDialog
      open={open}
      rootPath="/"
      candidates={pickedLayers.map((p) => ({
        sitecoreJsonPath: p.sitecoreJsonPath,
        moduleCount: p.moduleCount,
        pushOpsSummary: p.pushOpsSummary,
      }))}
      onClose={handleClose}
      onConfirm={handleLayersConfirm}
      onAddAnother={handleAddAnother}
      isPending={openProject.isPending}
      serverError={openProject.error?.message ?? null}
    />
  );
}
