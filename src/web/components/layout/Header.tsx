
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import { mdiCogOutline } from '@mdi/js';
import { SettingsDialog } from '@/settings/SettingsDialog';
import { CartIcon } from '@/components/package/CartIcon';

interface HeaderProps {
  validationErrorCount: number;
  onValidationClick: () => void;
  onCartToggle: () => void;
}

export function Header({ validationErrorCount, onValidationClick, onCartToggle }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b bg-card px-4 py-2 h-16 shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <a href="/" aria-label="Home" className="flex items-center gap-3">
          <img src="/mockingbird-tile.svg" alt="" className="size-10" />
          <span className="font-semibold text-xl">Mockingbird</span>
        </a>
      </div>
      <div className="flex items-center gap-2">
        {validationErrorCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onValidationClick}>
            <Badge colorScheme="danger">{validationErrorCount} errors</Badge>
          </Button>
        )}
        <CartIcon onToggle={onCartToggle} />
        <SettingsDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label="Settings" className="[&_svg]:!size-6">
              <Icon path={mdiCogOutline} />
            </Button>
          }
        />
      </div>
    </header>
  );
}
