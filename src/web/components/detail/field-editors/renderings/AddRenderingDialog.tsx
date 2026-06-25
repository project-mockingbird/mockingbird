// src/web/components/detail/field-editors/renderings/AddRenderingDialog.tsx

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCompatibleRenderings } from './hooks';
import { RenderingTreePicker } from './RenderingTreePicker';
import type { RenderingEntry } from './types';
import { generateUid } from './utils';
import { buildAddedRenderingEntry } from './add-rendering';

interface AddRenderingDialogProps {
  open: boolean;
  pageItemId: string;
  initialPlaceholder?: string;       // pre-filled when opened from a specific placeholder's "+" affordance
  /** DynamicPlaceholderId to stamp if the chosen rendering declares one. */
  nextDynamicPlaceholderId: number;
  title?: string;                    // dialog title (defaults to "Add Rendering")
  saveLabel?: string;                // primary button label (defaults to "Add")
  onCancel: () => void;
  onSave: (entry: RenderingEntry) => void;
}

export function AddRenderingDialog({
  open, pageItemId, initialPlaceholder, nextDynamicPlaceholderId,
  title = 'Add Rendering', saveLabel = 'Add',
  onCancel, onSave,
}: AddRenderingDialogProps) {
  const placeholder = initialPlaceholder ?? '';
  const [renderingId, setRenderingId] = useState<string>('');
  const [dataSource, setDataSource] = useState<string>('');

  useEffect(() => {
    if (open) {
      setRenderingId('');
      setDataSource('');
    }
  }, [open, initialPlaceholder]);

  // When the placeholder's Allowed Controls list is defined, the server
  // returns only those (the filtered set). When Allowed Controls is empty
  // or no Placeholder Settings item exists, the server falls through to
  // every rendering under /sitecore/layout/Renderings - so the same hook
  // covers both "constrained" and "show everything" cases.
  const { data: compatibleResp, isLoading: compatLoading } = useCompatibleRenderings(
    placeholder || undefined,
    pageItemId,
  );
  const renderings = (compatibleResp?.renderings ?? []) as Parameters<typeof RenderingTreePicker>[0]['renderings'];

  const canSave = !!placeholder && !!renderingId;

  const handleSave = () => {
    if (!canSave) return;
    const norm = (id: string) => id.replace(/[{}]/g, '').toLowerCase();
    const selected = (compatibleResp?.renderings ?? []).find(r => norm(r.id) === norm(renderingId));
    const entry = buildAddedRenderingEntry({
      uid: generateUid(),
      renderingId,
      placeholder,
      dataSource: dataSource.trim(),
      declaresDynamicPlaceholders: selected?.declaresDynamicPlaceholders ?? false,
      nextDynamicPlaceholderId,
    });
    onSave(entry);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Placeholder (read-only - user clicked "+" on this specific row) */}
          <div className="min-w-0">
            <label className="text-xs font-medium mb-1 block">Placeholder</label>
            <div
              className="rounded-md border border-input bg-muted/30 px-3 py-1.5 text-xs font-mono truncate"
              title={placeholder}
            >
              {placeholder || <span className="italic text-muted-foreground">(none)</span>}
            </div>
          </div>

          {/* Rendering tree picker (200px tall, fixed) */}
          <div className="min-w-0">
            <label className="text-xs font-medium mb-1 block">Rendering</label>
            <RenderingTreePicker
              renderings={renderings}
              selectedId={renderingId}
              onSelect={setRenderingId}
              isLoading={compatLoading}
              disabled={!placeholder}
              emptyMessage={
                placeholder
                  ? 'No renderings available for this placeholder.'
                  : 'Pick a placeholder first.'
              }
            />
          </div>

          {/* Datasource (free-text; format: local:Path or {GUID}) */}
          <div className="min-w-0">
            <label className="text-xs font-medium mb-1 block">Datasource</label>
            <Input
              type="text"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              placeholder="local:Data/Item Name or {GUID} (leave empty for none)"
              className="text-xs font-mono"
              disabled={!renderingId}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>{saveLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
