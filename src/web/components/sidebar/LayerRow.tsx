import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiDotsVertical, mdiFolderArrowRight, mdiClose } from '@mdi/js';
import { EditableLayerName } from './EditableLayerName';
import { ColorSwatch } from './ColorSwatch';

interface LayerRowProps {
  layerName: string;
  effectiveCount: number;
  color: string;
  visible: boolean;
  ootbSubstrate?: boolean;
  onToggle: (visible: boolean) => void;
  onRename: (newName: string) => void;
  onRecolor: (newColor: string) => void;
  /**
   * Called when the user confirms removal of this layer through the kebab menu's
   * inline confirm flow. Not called for OOTB substrate or when canRemove is
   * false (Remove menu item is disabled in those cases).
   */
  onRemove?: () => void;
  /** Called when the user picks "Replace source..." from the kebab menu. */
  onReplaceSource?: () => void;
  /**
   * False when this is the last user layer (engine requires >=1) or when the
   * row should otherwise lock removal. Disables the Remove menu item.
   */
  canRemove?: boolean;
  /** Optional tooltip text shown on hover of the layer name. */
  titleHint?: string;
}

export function LayerRow({
  layerName,
  effectiveCount,
  color,
  visible,
  ootbSubstrate,
  onToggle,
  onRename,
  onRecolor,
  onRemove,
  onReplaceSource,
  canRemove = true,
  titleHint,
}: LayerRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  if (confirmingRemove) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent/50">
        <span className="flex-1 truncate text-xs">Remove {layerName} from this project?</span>
        <button
          type="button"
          onClick={() => setConfirmingRemove(false)}
          className="text-xs px-2 py-0.5 rounded border hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmingRemove(false);
            onRemove?.();
          }}
          className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50">
      <input
        type="checkbox"
        checked={visible}
        disabled={ootbSubstrate}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={`Toggle layer ${layerName}`}
      />
      <ColorSwatch
        value={color}
        onChange={onRecolor}
        disabled={ootbSubstrate}
        ariaLabel={`Layer color for ${layerName}`}
      />
      <div className="flex-1 min-w-0" title={titleHint}>
        <EditableLayerName value={layerName} onChange={onRename} disabled={ootbSubstrate} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{effectiveCount}</span>
      {!ootbSubstrate && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Layer actions"
            title="Layer actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon path={mdiDotsVertical} className="size-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-44 rounded border bg-popover shadow-md text-sm py-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onReplaceSource?.();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
              >
                <Icon path={mdiFolderArrowRight} className="size-4 text-muted-foreground" />
                Replace source...
              </button>
              <button
                type="button"
                disabled={!canRemove}
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmingRemove(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent text-left text-danger-fg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Icon path={mdiClose} className="size-4" />
                Remove layer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
