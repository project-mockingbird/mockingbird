import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAllTemplates } from '@/hooks/useAllTemplates';
import { useNameValidation } from '@/hooks/useNameValidation';
import { TemplateTreePicker } from './insert-from-template/TemplateTreePicker';

interface InsertFromTemplateDialogProps {
  open: boolean;
  parentPath: string;
  /** Sibling names of the new child, for sibling-uniqueness validation. */
  siblings: string[];
  onConfirm: (req: { templateId: string; name: string }) => void;
  onClose: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

export function InsertFromTemplateDialog({
  open,
  parentPath,
  siblings,
  onConfirm,
  onClose,
  isPending = false,
  serverError = null,
}: InsertFromTemplateDialogProps) {
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedDisplayName, setSelectedDisplayName] = useState<string>('');
  const [name, setName] = useState<string>('');
  /** Tracks whether the user has typed in the name field. We only auto-fill
   *  on selection when the user has not typed - otherwise their input wins. */
  const [nameUserEdited, setNameUserEdited] = useState(false);

  // Reset all state when the dialog opens.
  useEffect(() => {
    if (open) {
      setFilter('');
      setSelectedId('');
      setSelectedDisplayName('');
      setName('');
      setNameUserEdited(false);
    }
  }, [open]);

  const { data, isLoading } = useAllTemplates({ enabled: open });
  const templates = data?.templates ?? [];

  const handleSelectTemplate = (id: string) => {
    setSelectedId(id);
    const meta = templates.find(t => t.id === id);
    const display = meta?.displayName ?? '';
    setSelectedDisplayName(display);
    if (!nameUserEdited) {
      setName(display);
    }
  };

  const validationError = useNameValidation(name, siblings);

  const canSubmit = !!selectedId && name.length > 0 && !validationError && !isPending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm({ templateId: selectedId, name });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Insert from template</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Parent path (read-only) */}
          <div className="min-w-0">
            <label className="text-xs font-medium mb-1 block">Parent</label>
            <div
              className="rounded-md border border-input bg-muted/30 px-3 py-1.5 text-xs font-mono truncate"
              title={parentPath}
            >
              {parentPath}
            </div>
          </div>

          {/* Filter input */}
          <div className="min-w-0">
            <label className="text-xs font-medium mb-1 block" htmlFor="template-filter">
              Filter
            </label>
            <input
              id="template-filter"
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter templates..."
              className="w-full rounded border bg-background px-2 py-1.5 text-xs"
              disabled={isPending}
            />
          </div>

          {/* Tree picker */}
          <div className="min-w-0">
            <label className="text-xs font-medium mb-1 block">Template</label>
            <TemplateTreePicker
              templates={templates}
              selectedId={selectedId}
              onSelect={handleSelectTemplate}
              filter={filter}
              isLoading={isLoading}
              emptyMessage={isLoading ? 'Loading templates...' : 'No templates found.'}
            />
          </div>

          {/* Name input */}
          <div className="min-w-0">
            <label className="text-xs font-medium mb-1 block" htmlFor="new-item-name">
              Name
            </label>
            <input
              id="new-item-name"
              type="text"
              value={name}
              onChange={(e) => {
                setNameUserEdited(true);
                setName(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) handleConfirm();
                if (e.key === 'Escape') onClose();
              }}
              placeholder={selectedDisplayName || 'Pick a template first...'}
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              disabled={isPending || !selectedId}
            />
            {validationError && name.length > 0 && (
              <p className="text-xs text-destructive mt-1">{validationError}</p>
            )}
            {serverError && (
              <p className="text-xs text-destructive mt-1">{serverError}</p>
            )}
          </div>
        </div>

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
