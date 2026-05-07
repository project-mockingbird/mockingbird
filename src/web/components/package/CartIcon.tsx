// src/web/components/package/CartIcon.tsx
//
// Global header button that opens / closes the package-builder cart pane.
// Hidden until the cart has at least one source. Sized to match the gear
// icon (Button size="icon" + size-6 SVG).

import { Icon } from '@/lib/icon';
import { mdiPackageVariantClosed } from '@mdi/js';
import { Button } from '@/components/ui/button';
import { usePackageCart } from '@/state/usePackageCart';

export interface CartIconProps {
  onToggle: () => void;
}

export function CartIcon({ onToggle }: CartIconProps) {
  const { sources } = usePackageCart();
  const count = sources.length;
  if (count === 0) return null;

  // Cap the displayed count at 99+ so the badge stays compact at high counts.
  const display = count > 99 ? '99+' : String(count);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={`Package cart (${count} ${count === 1 ? 'source' : 'sources'})`}
      className="[&_svg]:!size-6 relative"
    >
      <Icon path={mdiPackageVariantClosed} />
      <span
        className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-foreground text-background text-[10px] font-bold tabular-nums ring-2 ring-card pointer-events-none"
        aria-hidden="true"
      >
        {display}
      </span>
    </Button>
  );
}
