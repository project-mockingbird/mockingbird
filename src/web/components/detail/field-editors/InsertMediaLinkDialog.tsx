import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAncestors, useItem, useItemByPath, useLookupSource } from '@/hooks/useItems';
import {
  mapTargetAttributeToDropdown,
  mapTargetDropdownToAttribute,
} from './link-target';
import {
  EMPTY_COMMON_FORM,
  LinkFormFields,
  type CommonLinkFormState,
} from './LinkFormFields';
import { InsertLinkTreePane } from './InsertLinkTreePane';
import {
  serializeMediaLinkXml,
  type ParsedLink,
} from './GeneralLinkFieldEditor';
import type { TreeNode, LookupSourceItem } from '@/lib/types';

const MEDIA_LIBRARY_PATH = '/sitecore/media library';

export interface InsertMediaLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (xml: string) => void;
  existing: ParsedLink | null;
  /**
   * The field's `Source` attribute. When set to a recognised SXA token (e.g.
   * `query:$siteMedia`), the tree is constrained to the resolved items
   * instead of falling back to the full /sitecore/media library tree.
   */
  fieldSource?: string;
  /**
   * The id of the item being edited. Required for SXA token resolution
   * - `$siteMedia` reads the SitemapMediaItems field on the context's site
   * ancestor.
   */
  contextItemId?: string;
}

function formFromExisting(existing: ParsedLink | null): CommonLinkFormState {
  if (!existing || existing.linktype !== 'media') return { ...EMPTY_COMMON_FORM };
  const { dropdown, custom } = mapTargetAttributeToDropdown(existing.target ?? '');
  return {
    text: existing.text ?? '',
    targetDropdown: dropdown,
    targetCustom: custom,
    cls: existing.class ?? '',
    title: existing.title ?? '',
  };
}

export function InsertMediaLinkDialog({
  open,
  onOpenChange,
  onInsert,
  existing,
  fieldSource,
  contextItemId,
}: InsertMediaLinkDialogProps) {
  const [form, setForm] = useState<CommonLinkFormState>(() => formFromExisting(existing));
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [descriptionTouched, setDescriptionTouched] = useState(() => !!existing?.text);

  // Honor whatever Source the field declares - the picker doesn't try to
  // interpret tokens or filter by what "should" be media-relevant. When the
  // source resolves to a non-empty result, surface those items as multi-root
  // tree tops; otherwise fall back to /sitecore/media library.
  const lookupQuery = useLookupSource(fieldSource ?? '', contextItemId);
  const sourceRoots: TreeNode[] | undefined = useMemo(() => {
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

  // Fall-back single-root: useItemByPath('/sitecore/media library') returns the
  // media library item; the tree shows its children as the visible roots
  // (matches Sitecore CE Insert Media Link). Only used when sourceRoots is
  // undefined so we don't waste a fetch when the source resolves.
  const mediaRootQuery = useItemByPath(
    open && sourceRoots === undefined ? MEDIA_LIBRARY_PATH : null,
  );
  const mediaRootId: string | null =
    sourceRoots === undefined ? mediaRootQuery.data?.id ?? null : null;

  const editingId = existing?.linktype === 'media' ? (existing.id ?? null) : null;
  const ancestorsQuery = useAncestors(editingId);
  const editingItemQuery = useItem(editingId);
  const initialExpanded = useMemo(
    () => new Set(ancestorsQuery.data ?? []),
    [ancestorsQuery.data],
  );

  useEffect(() => {
    if (!open) return;
    setForm(formFromExisting(existing));
    setDescriptionTouched(!!existing?.text);
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
  // author has touched the field (or opened with existing non-empty text).
  useEffect(() => {
    if (!selected || descriptionTouched) return;
    const name = selected.displayName ?? selected.name;
    setForm((f) => ({ ...f, text: name }));
  }, [selected, descriptionTouched]);

  const patch = (p: Partial<CommonLinkFormState>) => setForm((f) => ({ ...f, ...p }));

  const disabled = selected === null;

  const handleInsert = () => {
    if (!selected) return;
    const target = mapTargetDropdownToAttribute(form.targetDropdown, form.targetCustom);
    onInsert(serializeMediaLinkXml({
      text: form.text,
      target,
      title: form.title,
      class: form.cls,
      id: selected.id,
    }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Insert Media Link</DialogTitle>
          <DialogDescription>
            Navigate to the media item that you want to link to and specify any additional properties for the link.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
          <div data-testid="insert-media-tree-pane" className="overflow-hidden">
            <InsertLinkTreePane
              rootId={mediaRootId}
              rootItems={sourceRoots}
              selectedId={selected?.id ?? null}
              onSelect={(node) => setSelected(node)}
              initialExpanded={initialExpanded}
            />
          </div>
          <div data-testid="insert-media-form-pane" className="flex flex-col gap-2 text-sm overflow-y-auto pr-1">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Item Name:</span>
              <span data-testid="insert-media-item-name">{selected?.displayName ?? selected?.name ?? '-'}</span>
            </div>
            <LinkFormFields
              form={form}
              onChange={patch}
              enabled={!disabled}
              onDescriptionTouched={() => setDescriptionTouched(true)}
            />
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
