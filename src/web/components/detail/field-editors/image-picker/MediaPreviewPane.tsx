import { useItem } from '@/hooks/useItems';
import {
  ALT_FIELD_ID,
  EXTENSION_FIELD_ID,
  HEIGHT_FIELD_ID,
  MEDIA_LIBRARY_PATH_PREFIX,
  WIDTH_FIELD_ID,
  buildMediaUrl,
} from '@/lib/image-xml';
import { readItemField } from '@/lib/item-fields';

interface MediaPreviewPaneProps {
  itemId: string | null;
}

export function MediaPreviewPane({ itemId }: MediaPreviewPaneProps) {
  const { data: item, isLoading } = useItem(itemId);

  if (itemId === null) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
        No image selected
      </div>
    );
  }

  if (isLoading || !item) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
        Loading...
      </div>
    );
  }

  const ext = readItemField(item, EXTENSION_FIELD_ID);
  const width = readItemField(item, WIDTH_FIELD_ID);
  const height = readItemField(item, HEIGHT_FIELD_ID);
  const alt = readItemField(item, ALT_FIELD_ID);
  const url = buildMediaUrl(item.path, item.id, ext);
  const displayPath = item.path.toLowerCase().startsWith(MEDIA_LIBRARY_PATH_PREFIX)
    ? item.path.slice(MEDIA_LIBRARY_PATH_PREFIX.length)
    : item.path;

  return (
    <div className="h-full flex flex-col gap-2 p-2 text-xs">
      <div className="flex items-center justify-center bg-muted/30 rounded border border-border min-h-[120px]">
        <img src={url} alt={alt ?? ''} className="max-h-[120px] max-w-full object-contain" />
      </div>
      <dl className="space-y-1">
        <div>
          <dt className="text-muted-foreground">Path</dt>
          <dd className="font-mono break-all">{displayPath}</dd>
        </div>
        {(width || height) && (
          <div>
            <dt className="text-muted-foreground">Dimensions</dt>
            <dd>{width ?? '?'} x {height ?? '?'}</dd>
          </div>
        )}
        {alt && (
          <div>
            <dt className="text-muted-foreground">Alt (default)</dt>
            <dd>{alt}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
