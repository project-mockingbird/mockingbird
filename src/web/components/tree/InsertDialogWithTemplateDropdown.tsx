import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useInsertOptions } from '@/hooks/useInsertOptions';
import { useNameValidation } from '@/hooks/useNameValidation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Combined Insert dialog used by the + hover-icon flow. Differs from
// InsertItemDialog (which is driven from the right-click submenu and
// receives a pre-selected template) by ALSO presenting a template picker.
// Lazy-loads __Masters options when open=true.
interface InsertDialogWithTemplateDropdownProps {
  open: boolean;
  parentId: string;
  parentPath: string;
  siblings: string[];
  onConfirm: (req: { templateId: string; name: string }) => void;
  onClose: () => void;
  isPending?: boolean;
  serverError?: string | null;
  /**
   * Fired once the options query completes and the result is empty.
   * Parent typically closes this dialog and opens the
   * InsertFromTemplateDialog instead, so the user can pick from the full
   * /sitecore/templates tree rather than seeing an empty curated list.
   */
  onNoOptions?: () => void;
}

export function InsertDialogWithTemplateDropdown({
  open,
  parentId,
  parentPath,
  siblings,
  onConfirm,
  onClose,
  isPending = false,
  serverError = null,
  onNoOptions,
}: InsertDialogWithTemplateDropdownProps) {
  const optionsQuery = useInsertOptions(parentId, open);
  const options = optionsQuery.data?.options ?? [];

  // When the curated __Masters list is empty, redirect to the
  // Insert-from-Template flow instead of showing the dead-end empty state.
  useEffect(() => {
    if (open && optionsQuery.isSuccess && options.length === 0) {
      onNoOptions?.();
    }
  }, [open, optionsQuery.isSuccess, options.length, onNoOptions]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [name, setName] = useState('');

  // When options arrive, default to the first template; pre-fill name with
  // the template's name (Sitecore CE behaviour).
  useEffect(() => {
    if (options.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(options[0].templateId);
      setName(options[0].templateName);
    }
  }, [options, selectedTemplateId]);

  // Reset selection when the dialog closes/reopens.
  useEffect(() => {
    if (!open) {
      setSelectedTemplateId('');
      setName('');
    }
  }, [open]);

  const validationError = useNameValidation(name, siblings);
  const canSubmit = !!selectedTemplateId && !validationError && !isPending;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedTemplateId(id);
    const opt = options.find((o) => o.templateId === id);
    if (opt) setName(opt.templateName);
  };

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm({ templateId: selectedTemplateId, name });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert item</DialogTitle>
        </DialogHeader>
        {optionsQuery.isLoading && <p className="text-sm">Loading...</p>}
        {!optionsQuery.isLoading && options.length === 0 && (
          <p className="text-sm text-muted-foreground">No insert options available.</p>
        )}
        {!optionsQuery.isLoading && options.length > 0 && (
          <>
            <div className="text-sm mb-3">
              <span className="block mb-1 text-muted-foreground">Parent</span>
              <div className="rounded border bg-muted/50 px-2 py-1.5 text-xs font-mono text-muted-foreground break-all">
                {parentPath}
              </div>
            </div>
            <label className="text-sm">
              <span className="block mb-1">Template</span>
              <select
                value={selectedTemplateId}
                onChange={handleSelectChange}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                disabled={isPending}
              >
                {options.map((opt) => (
                  <option key={opt.templateId} value={opt.templateId}>
                    {opt.templateName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm mt-3">
              <span className="block mb-1">Name</span>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) handleConfirm();
                  if (e.key === 'Escape') onClose();
                }}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                disabled={isPending}
              />
            </label>
            {validationError && (
              <p className="text-xs text-destructive mt-1">{validationError}</p>
            )}
            {serverError && (
              <p className="text-xs text-destructive mt-1">{serverError}</p>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canSubmit}>
            {isPending && <Spinner className="size-3 mr-1" variant="primary" />}
            {isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
