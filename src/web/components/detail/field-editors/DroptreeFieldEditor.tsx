// src/web/components/detail/field-editors/DroptreeFieldEditor.tsx
//
// Droptree editor: a single-select TREE picker (vs the flat dropdown the
// LookupFieldEditor uses for Droplink/Droplist). This is what Sitecore renders
// for Droptree fields such as a rendering's "Parameters Template" - the tree
// is rooted at the field's Source and you navigate down to pick an item.
//
// Wire format matches Droplink: a braced GUID. The tree's top level is the
// Source item's children (resolved by the lookup-source resolver); an empty
// Source falls back to /sitecore (parity with Sitecore.Kernel
// DataContext.GetState). The current value's ancestor chain is auto-expanded
// so the tree opens to the selection.

import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Icon } from '@/lib/icon';
import { mdiChevronDown, mdiClose } from '@mdi/js';
import type { TreeNode } from '@/lib/types';
import { useLookupSource, useItem, useAncestors } from '@/hooks/useItems';
import { ItemTreePicker } from '@/components/tree-picker/ItemTreePicker';
import { FieldShell } from './FieldShell';
import { normaliseGuid, bracedGuid } from './utils';

interface DroptreeFieldEditorProps {
  fieldId: string;
  label: string;
  value: string;
  fieldSource: string;
  contextItemId?: string;
  editing: boolean;
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

export function DroptreeFieldEditor({
  fieldId,
  label,
  value,
  fieldSource,
  contextItemId,
  editing,
  onChange,
  onNavigate,
}: DroptreeFieldEditorProps) {
  const [open, setOpen] = useState(false);

  const trimmedSource = fieldSource.trim();
  const effectiveSource = trimmedSource === '' ? '/sitecore' : fieldSource;
  const { data: rootItems, isLoading, error } = useLookupSource(effectiveSource, contextItemId);

  const currentGuid = value ? normaliseGuid(value) : '';
  const { data: currentItem } = useItem(currentGuid || null);
  const { data: ancestors } = useAncestors(currentGuid || null);
  const autoExpandIds = useMemo(() => new Set(ancestors ?? []), [ancestors]);

  // The lookup-source resolver returns the Source's immediate children - the
  // picker's top level. ItemTreePicker only reads id / name / displayName /
  // hasChildren; the other TreeNode fields are placeholders.
  const roots = useMemo<TreeNode[]>(
    () =>
      (rootItems ?? []).map((it) => ({
        id: it.id,
        name: it.name,
        displayName: it.displayName || it.name,
        path: it.path,
        template: it.templateId,
        type: 'unknown',
        source: 'serialized',
        hasChildren: it.hasChildren,
      })),
    [rootItems],
  );

  // Unsupported / unresolvable Source -> raw-text fallback (parity with the
  // flat LookupFieldEditor) so the value is still editable.
  if (error) {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-xs" readOnly={!editing} />
        <span className="text-[10px] text-muted-foreground">Source not supported - editing as raw text.</span>
      </FieldShell>
    );
  }

  const display = !value ? '(none)' : currentItem?.path ?? currentItem?.name ?? currentGuid;

  const handleSelect = (node: TreeNode) => {
    onChange(bracedGuid(node.id));
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setOpen(false);
  };

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <Popover open={open} onOpenChange={editing ? setOpen : undefined}>
        <PopoverTrigger
          disabled={!editing}
          className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>{display}</span>
          <Icon path={mdiChevronDown} className="size-3 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-[min(34rem,90vw)] p-0" align="start">
          <div className="flex items-center justify-between gap-2 border-b px-2 py-1">
            <span className="truncate text-[11px] text-muted-foreground">{value ? display : 'Select an item'}</span>
            {value && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Icon path={mdiClose} className="size-3" /> Clear
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground">Loading...</div>
          ) : roots.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No items under source.</div>
          ) : (
            <ItemTreePicker
              selectedId={currentGuid || null}
              onSelect={handleSelect}
              rootItems={roots}
              autoExpandIds={autoExpandIds}
              className="h-72 overflow-auto p-1"
            />
          )}
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
}
