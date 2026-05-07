// src/web/components/detail/field-editors/InsertLinkDialog.tsx
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TARGET_DROPDOWN_OPTIONS,
  mapTargetAttributeToDropdown,
  mapTargetDropdownToAttribute,
  type TargetDropdownValue,
} from './link-target';
import { serializeLinkXml, type ParsedLink } from './GeneralLinkFieldEditor';
import { ItemTreePicker } from '@/components/tree-picker/ItemTreePicker';
import type { TreeNode, LookupSourceItem } from '@/lib/types';
import { useAncestors, useItem, useLookupSource } from '@/hooks/useItems';

export interface InsertLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (xml: string) => void;
  existing: ParsedLink | null;
  fieldSource: string;
  contextItemId: string | undefined;
}

interface FormState {
  text: string;
  anchor: string;
  targetDropdown: TargetDropdownValue;
  targetCustom: string;
  title: string;
  cls: string;
  querystring: string;
}

const EMPTY_FORM: FormState = {
  text: '',
  anchor: '',
  targetDropdown: 'Active Browser',
  targetCustom: '',
  title: '',
  cls: '',
  querystring: '',
};

function formFromExisting(existing: ParsedLink | null): FormState {
  if (!existing || existing.linktype !== 'internal') return { ...EMPTY_FORM };
  const { dropdown, custom } = mapTargetAttributeToDropdown(existing.target ?? '');
  return {
    text: existing.text ?? '',
    anchor: existing.anchor ?? '',
    targetDropdown: dropdown,
    targetCustom: custom,
    title: existing.title ?? '',
    cls: existing.class ?? '',
    querystring: existing.querystring ?? '',
  };
}

export function InsertLinkDialog({
  open,
  onOpenChange,
  onInsert,
  existing,
  fieldSource,
  contextItemId,
}: InsertLinkDialogProps) {
  const [form, setForm] = useState<FormState>(() => formFromExisting(existing));
  const [selected, setSelected] = useState<TreeNode | null>(null);
  // True when the user has explicitly typed in Description, OR when we
  // opened with a non-empty existing text. Suppresses the auto-default
  // "follow selected item's name" behavior so we don't clobber explicit
  // author input when the selection changes.
  const [descriptionTouched, setDescriptionTouched] = useState(() => !!existing?.text);
  const selectedId = selected?.id ?? null;
  const selectedName = selected?.displayName ?? selected?.name ?? null;
  const selectedType = selected?.template ?? null;

  const lookupQuery = useLookupSource(fieldSource, contextItemId);

  // When Source resolves to a non-empty item set, ALWAYS surface those items
  // as independently-expandable tree roots - whether they share a parent or
  // not. Rooting at the common parent (an earlier design) was insufficient:
  // it expanded the tree to ALL of the parent's children, including non-
  // source items, which defeats the purpose of constraining by Source.
  // Mirrors Sitecore's CrossSiteLinksMultiRootTreeview / ExtendedMultiRootTreeview.
  const multiRootItems: TreeNode[] | undefined = useMemo(() => {
    if (!lookupQuery.data || lookupQuery.data.length === 0) return undefined;
    return lookupQuery.data.map((item: LookupSourceItem) => ({
      id: item.id,
      name: item.name,
      displayName: item.displayName,
      path: item.path,
      template: item.templateId,
      type: 'unknown' as const,
      source: 'serialized' as const,
      hasChildren: item.hasChildren,
    }));
  }, [lookupQuery.data]);

  // Single-root fallback (no Source / unsupported Source / empty result):
  // useTree() inside ItemTreePicker drives the tree from the engine's natural root.

  const editingId = existing?.linktype === 'internal' ? (existing.id ?? null) : null;
  const ancestorsQuery = useAncestors(editingId);
  const editingItemQuery = useItem(editingId);
  const initialExpanded = useMemo(
    () => new Set(ancestorsQuery.data ?? []),
    [ancestorsQuery.data],
  );

  // Reset form when reopening with new `existing` prop.
  useEffect(() => {
    if (!open) return;
    setForm(formFromExisting(existing));
    setDescriptionTouched(!!existing?.text);
    // Seed selection in edit mode once the linked item resolves.
    const item = editingItemQuery.data;
    if (editingId && item) {
      setSelected({
        id: item.id,
        name: item.name,
        path: item.path,
        template: item.template,
        type: 'unknown',
        source: 'serialized',
        hasChildren: false,
      });
    } else {
      setSelected(null);
    }
  }, [open, existing, editingId, editingItemQuery.data]);

  // Auto-default Description to the selected item's name. Skipped once the
  // author has touched the field (or opened with an existing non-empty text).
  // Reapplies on each selection change so picking a different item updates
  // the default. Author-typed values are preserved via descriptionTouched.
  useEffect(() => {
    if (!selected || descriptionTouched) return;
    const name = selected.displayName ?? selected.name;
    setForm(f => ({ ...f, text: name }));
  }, [selected, descriptionTouched]);

  const disabled = selectedId === null;

  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  const handleInsert = () => {
    if (!selected) return;
    const target = mapTargetDropdownToAttribute(form.targetDropdown, form.targetCustom);
    const xml = serializeLinkXml({
      text: form.text,
      anchor: form.anchor,
      target,
      title: form.title,
      class: form.cls,
      querystring: form.querystring,
      id: selected.id,
    });
    onInsert(xml);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
          <div data-testid="insert-link-tree-pane" className="overflow-hidden">
            <ItemTreePicker
              rootItems={multiRootItems}
              selectedId={selectedId}
              onSelect={(node) => setSelected(node)}
              autoExpandIds={initialExpanded}
            />
          </div>
          <div data-testid="insert-link-form-pane" className="flex flex-col gap-2 text-sm overflow-y-auto pr-1">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Item Name:</span>
              <span data-testid="insert-link-item-name">{selectedName ?? '-'}</span>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Description</span>
              <Input
                aria-label="Description"
                disabled={disabled}
                value={form.text}
                onChange={(e) => { patch({ text: e.target.value }); setDescriptionTouched(true); }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Anchor</span>
              <Input
                aria-label="Anchor"
                disabled={disabled}
                value={form.anchor}
                onChange={(e) => patch({ anchor: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Target</span>
              <Select
                disabled={disabled}
                value={form.targetDropdown}
                onValueChange={(v) => patch({
                  targetDropdown: v as TargetDropdownValue,
                  // clear Custom when leaving Custom (matches Sitecore OnListboxChanged)
                  targetCustom: v === 'Custom' ? form.targetCustom : '',
                })}
              >
                <SelectTrigger aria-label="Target"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_DROPDOWN_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Custom</span>
              <Input
                aria-label="Custom"
                disabled={disabled || form.targetDropdown !== 'Custom'}
                value={form.targetCustom}
                onChange={(e) => patch({ targetCustom: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Alternate text</span>
              <Input
                aria-label="Alternate text"
                disabled={disabled}
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Style class</span>
              <Input
                aria-label="Style class"
                disabled={disabled}
                value={form.cls}
                onChange={(e) => patch({ cls: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Query string</span>
              <Input
                aria-label="Query string"
                disabled={disabled}
                value={form.querystring}
                onChange={(e) => patch({ querystring: e.target.value })}
              />
            </label>
            <div className="flex gap-2">
              <span className="text-muted-foreground">Type:</span>
              <span data-testid="insert-link-item-type">{selectedType ?? '-'}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={disabled} onClick={handleInsert}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
