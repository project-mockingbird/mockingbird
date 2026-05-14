import { useState } from 'react';
import { toast } from 'sonner';
import { FolderBrowser } from '@/components/open-project/FolderBrowser';

export interface LayerSourcePickerProps {
  open: boolean;
  mode: 'add' | 'replace';
  /** Replace mode: the path being replaced. Excluded from duplicate check. */
  currentPath?: string;
  /**
   * All paths currently in the project's layer set (including currentPath in
   * replace mode). The picker rejects a pick that matches any path other than
   * currentPath.
   */
  existingPaths: string[];
  onConfirm: (path: string) => void;
  onCancel: () => void;
}

/**
 * Thin wrapper around FolderBrowser for runtime-layer-management flows.
 *
 * Validates the picked file against the project's existing layer paths
 * (excluding currentPath in replace mode so the user can keep the same path,
 * which is treated as a cancel). Surfaces validation failures via toast and
 * does NOT invoke onConfirm.
 *
 * FolderBrowser does not yet expose a title slot, so the mode affordance is
 * carried via an sr-only banner with data-testid for test verification.
 */
export function LayerSourcePicker({
  open,
  mode,
  currentPath,
  existingPaths,
  onConfirm,
  onCancel,
}: LayerSourcePickerProps) {
  const [error, setError] = useState<string | null>(null);

  const handleFilePick = (filePath: string) => {
    setError(null);
    if (mode === 'replace' && filePath === currentPath) {
      onCancel();
      return;
    }
    const duplicate =
      mode === 'replace'
        ? existingPaths.some((p) => p !== currentPath && p === filePath)
        : existingPaths.includes(filePath);
    if (duplicate) {
      const msg = 'That layer is already in this project.';
      setError(msg);
      toast.warning(msg);
      return;
    }
    onConfirm(filePath);
  };

  if (!open) return null;

  return (
    <>
      <FolderBrowser open={open} onClose={onCancel} onFilePick={(filePath) => handleFilePick(filePath)} />
      <div data-testid="layer-source-picker-mode" className="sr-only">
        {mode === 'add' ? 'Add a layer' : 'Replace layer source'}
      </div>
      {error !== null && (
        <div role="alert" className="sr-only">
          {error}
        </div>
      )}
    </>
  );
}
