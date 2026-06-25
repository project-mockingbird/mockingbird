// src/web/components/tree/BaseTemplatePicker.tsx
//
// Single-select base-template picker for the template-create dialogs. A tree
// picker rooted at /sitecore/templates, mirroring the CE "Select name" dialog's
// Base template field. Value/onChange use plain lowercase ids (no braces) so the
// id can be sent straight to the insert API as baseTemplateId.
//
// Structurally a trimmed DroptreeFieldEditor: useLookupSource resolves the
// /sitecore/templates children as roots, the current value's ancestor chain is
// auto-expanded, and ItemTreePicker handles the lazy tree.

import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Icon } from '@/lib/icon';
import { mdiChevronDown } from '@mdi/js';
import type { TreeNode } from '@/lib/types';
import { useLookupSource, useItem, useAncestors } from '@/hooks/useItems';
import { ItemTreePicker } from '@/components/tree-picker/ItemTreePicker';
import { TEMPLATES_ROOT_PATH } from '@/lib/template-ids';

interface BaseTemplatePickerProps {
  /** Selected base template id (plain lowercase GUID, no braces). */
  value: string;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export function BaseTemplatePicker({ value, onChange, disabled = false }: BaseTemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const { data: rootItems, isLoading } = useLookupSource(TEMPLATES_ROOT_PATH, undefined);
  const { data: currentItem } = useItem(value || null);
  const { data: ancestors } = useAncestors(value || null);
  const autoExpandIds = useMemo(() => new Set(ancestors ?? []), [ancestors]);

  // useLookupSource returns the source's immediate children; ItemTreePicker only
  // reads id / name / displayName / hasChildren, the rest are placeholders.
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

  const display = currentItem?.path ?? currentItem?.name ?? value;

  const handleSelect = (node: TreeNode) => {
    onChange(node.id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{display}</span>
        <Icon path={mdiChevronDown} className="size-3 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-[min(34rem,90vw)] p-0" align="start">
        {isLoading ? (
          <div className="p-3 text-xs text-muted-foreground">Loading...</div>
        ) : roots.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No templates found.</div>
        ) : (
          <ItemTreePicker
            selectedId={value || null}
            onSelect={handleSelect}
            rootItems={roots}
            autoExpandIds={autoExpandIds}
            className="h-72 overflow-auto p-1"
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
