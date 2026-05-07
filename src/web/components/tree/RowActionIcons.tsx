import { Icon } from '@/lib/icon';
import { mdiPlus, mdiContentDuplicate, mdiRefresh, mdiDeleteOutline } from '@mdi/js';
import { cn } from '@/lib/utils';

interface RowActionIconsProps {
  isRegistry: boolean;
  onInsert: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  isRefreshing?: boolean;
}

/**
 * Right-aligned action icons: + (insert), duplicate, refresh, trash.
 * Renders nothing for registry-only rows (mirrors the right-click menu's
 * Insert disabled-state for parity, and pre-empts editable-OOTB scope creep).
 *
 * Hidden from layout entirely until the parent row is hovered or focused
 * (via `hidden group-hover:flex group-focus-within:flex`), so it does not
 * reserve horizontal space and the row's name span can use the full width.
 */
export function RowActionIcons({
  isRegistry,
  onInsert,
  onDuplicate,
  onRefresh,
  onDelete,
  isRefreshing = false,
}: RowActionIconsProps) {
  if (isRegistry) return null;
  return (
    <div className="hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
      <IconButton label="Insert" iconPath={mdiPlus} onClick={onInsert} />
      <IconButton label="Duplicate" iconPath={mdiContentDuplicate} onClick={onDuplicate} />
      <IconButton
        label="Refresh"
        iconPath={mdiRefresh}
        onClick={onRefresh}
        spin={isRefreshing}
      />
      <IconButton label="Delete" iconPath={mdiDeleteOutline} onClick={onDelete} />
    </div>
  );
}

interface IconButtonProps {
  label: string;
  iconPath: string;
  onClick: () => void;
  spin?: boolean;
}

function IconButton({ label, iconPath, onClick, spin = false }: IconButtonProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-sm',
        'hover:bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon path={iconPath} className={cn('h-3.5 w-3.5', spin && 'animate-spin')} />
    </button>
  );
}
