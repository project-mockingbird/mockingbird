// src/web/components/detail/ChangeIconButton.tsx
//
// Toolbar button that opens the ChangeIconDialog for the currently loaded
// item. Renders nothing when the sprite-icon feature is off (no baked set),
// and shows the item's current sprite icon (falling back to a generic MDI
// icon when there is no resolvable sprite) next to a "Change Icon" label.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import { mdiImageOutline } from '@mdi/js';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import { spriteIconSrc } from '@/lib/sprite-icon';
import { ChangeIconDialog } from './ChangeIconDialog';
import type { ItemDetail } from '@/lib/types';

const ICON_FIELD_ID = '06d5295c-ed2f-4a54-9bf2-26228d113318';

export function ChangeIconButton({ item }: { item: ItemDetail }) {
  const { data: status } = useEngineStatus();
  const [open, setOpen] = useState(false);
  if (!status?.iconsEnabled) return null;

  const current = item.sharedFields.find(f => f.id.toLowerCase() === ICON_FIELD_ID)?.value ?? null;
  const sprite = spriteIconSrc(current);

  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        {sprite
          ? (
            <img
              src={sprite}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 shrink-0 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )
          : <Icon path={mdiImageOutline} className="h-4 w-4 shrink-0" />}
        Change Icon
      </Button>
      {open && (
        <ChangeIconDialog
          itemId={item.id}
          currentIcon={current}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
