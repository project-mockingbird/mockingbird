// src/web/components/detail/field-editors/ImageFieldEditor.tsx
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Textarea } from '@/components/ui/textarea';
import { useItem } from '@/hooks/useItems';
import { FieldShell } from './FieldShell';
import {
  ALT_FIELD_ID,
  EXTENSION_FIELD_ID,
  HEIGHT_FIELD_ID,
  MEDIA_LIBRARY_PATH_PREFIX,
  WIDTH_FIELD_ID,
  buildMediaUrl,
  parseImageXml,
} from '@/lib/image-xml';
import { readItemField } from '@/lib/item-fields';
import { MediaPickerDialog } from './image-picker/MediaPickerDialog';

interface ImageFieldEditorProps {
  fieldId: string;
  label: string;
  value: string;
  editing: boolean;
  viewMode?: 'normal' | 'raw';
  /** Field's Source attribute (e.g. "query:$siteMedia"); empty/undefined = no constraint. */
  fieldSource?: string;
  /** Id of the item being edited; required for SXA token resolution. */
  contextItemId?: string;
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

export function ImageFieldEditor({ fieldId, label, value, editing, viewMode = 'normal', fieldSource, contextItemId, onChange, onNavigate }: ImageFieldEditorProps) {
  const parsed = useMemo(() => parseImageXml(value), [value]);
  const queryClient = useQueryClient();
  const { data: mediaItem } = useItem(parsed?.mediaid ?? null);

  const [pickerOpen, setPickerOpen] = useState(false);

  // Raw view: bypass everything and edit the XML directly.
  if (viewMode === 'raw') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-16 font-mono text-xs"
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  const ext = readItemField(mediaItem ?? null, EXTENSION_FIELD_ID);
  const width = mediaItem ? readItemField(mediaItem, WIDTH_FIELD_ID) : parsed?.width;
  const height = mediaItem ? readItemField(mediaItem, HEIGHT_FIELD_ID) : parsed?.height;
  const alt = parsed?.alt ?? (mediaItem ? readItemField(mediaItem, ALT_FIELD_ID) : undefined);

  const displayPath = mediaItem
    ? mediaItem.path.toLowerCase().startsWith(MEDIA_LIBRARY_PATH_PREFIX)
      ? mediaItem.path.slice(MEDIA_LIBRARY_PATH_PREFIX.length)
      : mediaItem.path
    : parsed
      ? `(loading) ${parsed.mediaid}`
      : '(no image)';

  const imageUrl = mediaItem ? buildMediaUrl(mediaItem.path, mediaItem.id, ext) : undefined;

  const handleClear = () => onChange('');
  const handleRefresh = () => {
    if (parsed?.mediaid) {
      queryClient.invalidateQueries({ queryKey: ['item', parsed.mediaid] });
    }
  };
  const handleOpenMediaLibrary = () => {
    if (mediaItem && onNavigate) onNavigate(mediaItem.id);
  };

  const linkClass = 'text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed';

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <div className="flex flex-col gap-1 max-h-[280px]">
        {/* Toolbar */}
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={!editing}
            className={linkClass}
          >
            Browse
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={handleOpenMediaLibrary}
            disabled={!mediaItem || !onNavigate}
            className={linkClass}
          >
            Open media library
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={handleClear}
            disabled={!editing || !parsed}
            className={linkClass}
          >
            Clear
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button type="button" onClick={handleRefresh} disabled={!parsed} className={linkClass}>
            Refresh
          </button>
        </div>

        {/* Path - matches Input primitive metrics for visual consistency with Single Line Text */}
        <div className="border border-input rounded-sm px-3 h-10 flex items-center text-base md:text-sm bg-body-bg truncate">
          {displayPath}
        </div>

        {/* Thumbnail */}
        <div className="flex-1 min-h-0 flex items-start">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={alt ?? ''}
              className="max-h-[150px] max-w-full object-contain border border-border rounded-sm"
            />
          ) : parsed ? (
            <div className="text-xs text-muted-foreground italic py-2">Loading thumbnail...</div>
          ) : (
            <div className="text-xs text-muted-foreground italic py-2">(no image set)</div>
          )}
        </div>

        {/* Footer */}
        <div className="text-[11px] text-muted-foreground space-y-0.5 bg-muted/30 rounded-sm px-2 py-1">
          {(width || height) ? (
            <div>Dimensions: {width ?? '?'} x {height ?? '?'}</div>
          ) : null}
          {parsed && !alt ? (
            <div className="text-amber-500/90">Warning: Alternate Text is missing.</div>
          ) : null}
        </div>
      </div>

      <MediaPickerDialog
        open={pickerOpen}
        current={parsed}
        fieldSource={fieldSource}
        contextItemId={contextItemId}
        onConfirm={(xml) => { onChange(xml); setPickerOpen(false); }}
        onClose={() => setPickerOpen(false)}
      />
    </FieldShell>
  );
}
