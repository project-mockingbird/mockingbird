import { useState } from 'react';
import { toast } from 'sonner';
import { FolderBrowser } from './FolderBrowser';
import { LayerSelectionDialog } from './LayerSelectionDialog';
import type { LayerRowState } from './LayerSelectionDialog';
import { useOpenProject } from '@/hooks/useOpenProject';
import { assignLayerColor } from './layer-colors';
import { deriveName } from './layer-name';
import { deriveProjectName } from './project-name';
import { computeProjectHash } from '@/state/project-hash';
import { useProjectsStore } from '@/state/projectsStore';

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

/**
 * Two-step wizard: pick a sitecore.json file (or any SCS root-config-shaped
 * JSON), then confirm + open. Multi-layer is progressive via the dialog's
 * "Add Layer" button which returns the wizard to the folder step. On
 * successful open, the resulting layer config is saved to localStorage as a
 * named Project.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function OpenProjectWizard({ open, onClose, initialMode = 'first-run' }: OpenProjectWizardProps) {
  const [step, setStep] = useState<Step>('folder');
  const [rows, setRows] = useState<LayerRowState[]>([]);
  const [projectName, setProjectName] = useState<string>('project');
  const [userEditedProjectName, setUserEditedProjectName] = useState<boolean>(false);
  const openProject = useOpenProject();
  const upsert = useProjectsStore((s) => s.upsert);
  const touchLastOpened = useProjectsStore((s) => s.touchLastOpened);

  const reset = () => {
    setStep('folder');
    setRows([]);
    setProjectName('project');
    setUserEditedProjectName(false);
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
    if (rows.some((r) => r.candidate.sitecoreJsonPath === filePath)) {
      toast.warning('That layer is already added.');
      return;
    }
    setRows((prev) => {
      const next = [
        ...prev,
        {
          candidate: { sitecoreJsonPath: filePath, moduleCount, pushOpsSummary },
          checked: true,
          color: assignLayerColor(prev.length),
          name: deriveName(filePath),
        },
      ];
      if (!userEditedProjectName) {
        setProjectName(deriveProjectName(next.map((r) => r.candidate.sitecoreJsonPath)));
      }
      return next;
    });
    setStep('layers');
  };

  const handleAddAnother = () => {
    setStep('folder');
  };

  const handleLayersConfirm = async (
    layers: { sitecoreJsonPath: string; name: string; color?: string }[],
  ) => {
    try {
      await openProject.mutateAsync({ layers, projectName });
      const paths = layers.map((l) => l.sitecoreJsonPath);
      const hash = await computeProjectHash(paths);
      const nowMs = Date.now();
      const existing = useProjectsStore.getState().get(hash);
      upsert({
        hash,
        name: projectName,
        layers: layers.map((l) => ({
          sitecoreJsonPath: l.sitecoreJsonPath,
          name: l.name,
          color: l.color ?? '#888888',
        })),
        createdAt: existing?.createdAt ?? nowMs,
        lastOpenedAt: nowMs,
      });
      touchLastOpened(hash);
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
      candidates={rows.map((r) => r.candidate)}
      initialRows={rows}
      onRowsChange={setRows}
      projectName={projectName}
      onProjectNameChange={(newName: string) => {
          setProjectName(newName);
          setUserEditedProjectName(true);
        }}
      onClose={handleClose}
      onConfirm={handleLayersConfirm}
      onAddAnother={handleAddAnother}
      isPending={openProject.isPending}
      serverError={openProject.error?.message ?? null}
    />
  );
}
