import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useDescendants } from '@/hooks/useDescendants';
import { useAncestors, useItem, useLookupSource } from '@/hooks/useItems';
import type { LookupSourceItem } from '@/lib/types';
import {
  ALT_FIELD_ID,
  EXTENSION_FIELD_ID,
  HEIGHT_FIELD_ID,
  MEDIA_LIBRARY_PATH_PREFIX,
  WIDTH_FIELD_ID,
  buildMediaUrl,
  serializeImageXml,
  type ParsedImage,
} from '@/lib/image-xml';
import { readItemField } from '@/lib/item-fields';
import { buildMediaTree, type MediaTreeNode } from './media-tree';
import { MediaTreeView } from './MediaTreeView';

export interface MediaPickerDialogProps {
  open: boolean;
  /** Current parsed image XML, or null when no image is set yet. */
  current: ParsedImage | null;
  /** Field's Source attribute (e.g. "query:$siteMedia"); empty/undefined = no constraint. */
  fieldSource?: string;
  /** Id of the item being edited; required for SXA token resolution. */
  contextItemId?: string;
  onConfirm: (newXml: string) => void;
  onClose: () => void;
}

interface FormState {
  alt: string;
  width: string;
  height: string;
  hspace: string;
  vspace: string;
}

function fromCurrent(c: ParsedImage | null): FormState {
  return {
    alt: c?.alt ?? '',
    width: c?.width ?? '',
    height: c?.height ?? '',
    hspace: c?.hspace ?? '',
    vspace: c?.vspace ?? '',
  };
}

function isValidNonNegInt(v: string): boolean {
  if (v === '') return true;
  return /^\d+$/.test(v);
}

export function MediaPickerDialog({
  open,
  current,
  fieldSource,
  contextItemId,
  onConfirm,
  onClose,
}: MediaPickerDialogProps) {
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(current?.mediaid ?? null);
  const [form, setForm] = useState<FormState>(() => fromCurrent(current));
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);

  // Reset state when the dialog opens.
  useEffect(() => {
    if (open) {
      setFilter('');
      setSelectedId(current?.mediaid ?? null);
      setForm(fromCurrent(current));
      setKeepAspectRatio(true);
    }
  }, [open, current]);

  // Site-scoping: resolve field source to a subtree root.
  const lookupQuery = useLookupSource(fieldSource ?? '', contextItemId);
  const sourceRootPath: string | null = useMemo(() => {
    if (!lookupQuery.data || lookupQuery.data.length === 0) return null;
    return (lookupQuery.data[0] as LookupSourceItem).path;
  }, [lookupQuery.data]);

  const rootPath = open ? (sourceRootPath ?? MEDIA_LIBRARY_PATH_PREFIX) : null;
  const { data: descendantsResponse, isLoading } = useDescendants(rootPath);

  const tree = useMemo<MediaTreeNode[]>(
    () => buildMediaTree(
      descendantsResponse?.items ?? [],
      sourceRootPath ?? MEDIA_LIBRARY_PATH_PREFIX,
    ),
    [descendantsResponse, sourceRootPath],
  );

  const { data: ancestorIds } = useAncestors(open ? current?.mediaid ?? null : null);
  const autoExpandIds = useMemo(() => new Set(ancestorIds ?? []), [ancestorIds]);

  // Selected media item for thumbnail + hints.
  const { data: selectedItem } = useItem(selectedId);

  const ext = selectedItem ? readItemField(selectedItem, EXTENSION_FIELD_ID) : undefined;
  const mediaWidth = selectedItem ? readItemField(selectedItem, WIDTH_FIELD_ID) : undefined;
  const mediaHeight = selectedItem ? readItemField(selectedItem, HEIGHT_FIELD_ID) : undefined;
  const mediaAlt = selectedItem ? readItemField(selectedItem, ALT_FIELD_ID) : undefined;
  const thumbnailUrl = selectedItem
    ? buildMediaUrl(selectedItem.path, selectedItem.id, ext)
    : undefined;

  // Keep Aspect Ratio helpers - only update the dependent dimension when KAR
  // is on, both media dimensions are known positive integers, and the typed
  // value is a valid positive integer.
  function changeWidth(rawValue: string) {
    setForm(prev => {
      const next = { ...prev, width: rawValue };
      if (
        keepAspectRatio &&
        mediaWidth &&
        mediaHeight &&
        /^\d+$/.test(rawValue) &&
        rawValue !== ''
      ) {
        const w = parseInt(rawValue, 10);
        const origW = parseInt(mediaWidth, 10);
        const origH = parseInt(mediaHeight, 10);
        if (origW > 0) {
          next.height = String(Math.round(w * origH / origW));
        }
      }
      return next;
    });
  }

  function changeHeight(rawValue: string) {
    setForm(prev => {
      const next = { ...prev, height: rawValue };
      if (
        keepAspectRatio &&
        mediaWidth &&
        mediaHeight &&
        /^\d+$/.test(rawValue) &&
        rawValue !== ''
      ) {
        const h = parseInt(rawValue, 10);
        const origW = parseInt(mediaWidth, 10);
        const origH = parseInt(mediaHeight, 10);
        if (origH > 0) {
          next.width = String(Math.round(h * origW / origH));
        }
      }
      return next;
    });
  }

  // Validation
  const widthError = !isValidNonNegInt(form.width);
  const heightError = !isValidNonNegInt(form.height);
  const hspaceError = !isValidNonNegInt(form.hspace);
  const vspaceError = !isValidNonNegInt(form.vspace);
  const hasError = widthError || heightError || hspaceError || vspaceError;

  const canConfirm = selectedId !== null && !hasError;

  const errorMsg = 'Must be a non-negative integer.';
  const numericProps = { type: 'text' as const, inputMode: 'numeric' as const, pattern: '\\d*' };

  const handleConfirm = () => {
    if (!canConfirm || !selectedId) return;
    const next: ParsedImage = {
      mediaid: selectedId,
      alt: form.alt || undefined,
      width: form.width || undefined,
      height: form.height || undefined,
      hspace: form.hspace || undefined,
      vspace: form.vspace || undefined,
      // Preserve hidden attrs from current - dropped from UI but round-tripped
      // so Sitecore-authored images don't lose them on save.
      cssClass: current?.cssClass || undefined,
      border: current?.border || undefined,
    };
    onConfirm(serializeImageXml(next));
  };

  const sectionClass = 'text-sm font-semibold';
  const inputClass = 'w-full rounded border bg-background px-2 py-1.5 text-sm';
  const labelClass = 'text-xs font-medium mb-1 block';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="xl" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select an image</DialogTitle>
          <DialogDescription>
            Pick a media item and set the per-usage properties for this image.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Left pane: filter + tree. The tree is absolutely positioned so
              its natural content height does NOT contribute to grid row sizing;
              that lets the right pane's form height drive the dialog's height,
              and grid's default align-items: stretch fills the left pane to
              match. The tree then scrolls within its absolute-positioned slot. */}
          <div className="flex flex-col gap-2 min-w-0">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter..."
              className="rounded border bg-background px-2 py-1.5 text-xs"
            />
            <div className="flex-1 min-h-0 relative">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>
              ) : (
                <div className="absolute inset-0 overflow-auto">
                  <MediaTreeView
                    tree={tree}
                    filter={filter}
                    selectedId={selectedId}
                    onSelect={(node) => setSelectedId(node.id)}
                    autoExpandIds={autoExpandIds}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right pane: thumbnail + form */}
          <div className="flex flex-col gap-3">
            {/* Thumbnail */}
            <div className="flex items-center justify-center bg-muted/30 rounded border border-border min-h-[120px] max-h-[160px]">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={mediaAlt ?? ''}
                  className="max-h-[160px] max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  {selectedId ? 'Loading...' : 'No image selected'}
                </span>
              )}
            </div>

            {/* Text section */}
            <p className={sectionClass}>Text</p>
            <div>
              <label className={labelClass} htmlFor="mpd-alt">Alternate Text</label>
              <input
                id="mpd-alt"
                type="text"
                value={form.alt}
                onChange={(e) => setForm(prev => ({ ...prev, alt: e.target.value }))}
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                Default Alternate Text: {mediaAlt || '[none]'}
              </p>
            </div>

            {/* Dimensions section */}
            <p className={`${sectionClass} mt-4`}>Dimensions</p>
            <div>
              <label className={labelClass} htmlFor="mpd-width">Width</label>
              <input
                id="mpd-width"
                {...numericProps}
                value={form.width}
                onChange={(e) => changeWidth(e.target.value)}
                className={inputClass}
              />
              {widthError && <p className="text-xs text-destructive">{errorMsg}</p>}
            </div>
            <div>
              <label className={labelClass} htmlFor="mpd-height">Height</label>
              <input
                id="mpd-height"
                {...numericProps}
                value={form.height}
                onChange={(e) => changeHeight(e.target.value)}
                className={inputClass}
              />
              {heightError && <p className="text-xs text-destructive">{errorMsg}</p>}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="mpd-kar"
                type="checkbox"
                checked={keepAspectRatio}
                onChange={(e) => setKeepAspectRatio(e.target.checked)}
              />
              <label htmlFor="mpd-kar" className="text-xs">Keep Aspect Ratio</label>
            </div>
            {(mediaWidth || mediaHeight) && (
              <p className="text-xs text-muted-foreground">
                Original Dimensions: {mediaWidth ?? '?'} x {mediaHeight ?? '?'}
              </p>
            )}

            {/* Space section */}
            <p className={`${sectionClass} mt-4`}>Space</p>
            <div>
              <label className={labelClass} htmlFor="mpd-hspace">Horizontal Space</label>
              <input
                id="mpd-hspace"
                {...numericProps}
                value={form.hspace}
                onChange={(e) => setForm(prev => ({ ...prev, hspace: e.target.value }))}
                className={inputClass}
              />
              {hspaceError && <p className="text-xs text-destructive">{errorMsg}</p>}
            </div>
            <div>
              <label className={labelClass} htmlFor="mpd-vspace">Vertical Space</label>
              <input
                id="mpd-vspace"
                {...numericProps}
                value={form.vspace}
                onChange={(e) => setForm(prev => ({ ...prev, vspace: e.target.value }))}
                className={inputClass}
              />
              {vspaceError && <p className="text-xs text-destructive">{errorMsg}</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
