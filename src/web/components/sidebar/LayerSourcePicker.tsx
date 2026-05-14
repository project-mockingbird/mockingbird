import { toast } from 'sonner';
import { FolderBrowser } from '@/components/open-project/FolderBrowser';
import { deriveName } from '@/components/open-project/layer-name';

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
 * Validates the picked file against the project's existing layer paths and,
 * in add mode, against the reserved layer name "ootb". Re-picking the current
 * path in replace mode is treated as cancel. Validation failures surface via
 * toast and do NOT invoke onConfirm.
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
  const handleFilePick = (filePath: string) => {
    if (mode === 'replace' && filePath === currentPath) {
      onCancel();
      return;
    }
    const duplicate = existingPaths.some((p) => p !== currentPath && p === filePath);
    if (duplicate) {
      toast.warning('That layer is already in this project.');
      return;
    }
    if (mode === 'add' && deriveName(filePath).toLowerCase() === 'ootb') {
      toast.warning('"ootb" is reserved; rename the folder before adding it as a layer.');
      return;
    }
    onConfirm(filePath);
  };

  if (!open) return null;

  return (
    <>
      <FolderBrowser open={open} onClose={onCancel} onFilePick={handleFilePick} />
      <div data-testid="layer-source-picker-mode" className="sr-only">
        {mode === 'add' ? 'Add a layer' : 'Replace layer source'}
      </div>
    </>
  );
}
