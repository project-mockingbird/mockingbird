import { Icon } from '@/lib/icon';
import { mdiFolderOpen, mdiPlusBox, mdiEye } from '@mdi/js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FirstRunChooserProps {
  open: boolean;
  onClose: () => void;
  onOpenExisting: () => void;
  onBrowseOotbOnly: () => void;
}

interface ChoiceTileProps {
  iconPath: string;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: string;
}

function ChoiceTile({ iconPath, title, description, onClick, disabled, badge }: ChoiceTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 rounded-lg border bg-card p-6 text-center transition-colors hover:bg-accent hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:border-border"
    >
      <Icon path={iconPath} className="size-10 text-foreground" />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
      {badge && (
        <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

export function FirstRunChooser({
  open,
  onClose,
  onOpenExisting,
  onBrowseOotbOnly,
}: FirstRunChooserProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Get started</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-4">
          <ChoiceTile
            iconPath={mdiFolderOpen}
            title="Open existing project"
            description="Point Mockingbird at a folder with sitecore.json files."
            onClick={onOpenExisting}
          />
          <ChoiceTile
            iconPath={mdiPlusBox}
            title="Create new project"
            description="Scaffold a fresh tenant + sitecore.json."
            onClick={() => {}}
            disabled
            badge="Coming soon"
          />
          <ChoiceTile
            iconPath={mdiEye}
            title="Just browse OOTB items"
            description="Read-only tree of the baked-in Sitecore items."
            onClick={onBrowseOotbOnly}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
