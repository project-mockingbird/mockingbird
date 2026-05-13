import { useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiChevronDown, mdiCheck } from '@mdi/js';
import { Button } from '@/components/ui/button';
import type { ProfileSummary } from '@/hooks/useProfiles';

interface ProfileDropdownProps {
  activeName: string | null;
  profiles: ProfileSummary[];
  onSave: () => void;
  onSaveAs: () => void;
  onSwitch: (name: string) => void;
  onManage: () => void;
}

export function ProfileDropdown({
  activeName,
  profiles,
  onSave,
  onSaveAs,
  onSwitch,
  onManage,
}: ProfileDropdownProps) {
  const [open, setOpen] = useState(false);
  const label = activeName ?? 'Unsaved';

  const handleSwitch = (name: string) => {
    setOpen(false);
    if (name !== activeName) onSwitch(name);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        aria-label="Profile"
        onClick={() => setOpen((v) => !v)}
        className="w-full justify-between"
      >
        {!open && (
          <span className={activeName ? '' : 'italic text-muted-foreground'}>{label}</span>
        )}
        <Icon path={mdiChevronDown} className="size-3" />
      </Button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded border bg-popover shadow-md text-sm">
          {profiles.length > 0 && (
            <ul className="py-1 max-h-48 overflow-y-auto">
              {profiles.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1 hover:bg-accent text-left"
                    onClick={() => handleSwitch(p.name)}
                  >
                    {p.name === activeName ? (
                      <Icon path={mdiCheck} className="size-3" />
                    ) : (
                      <span className="size-3" />
                    )}
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.layerCount} {p.layerCount === 1 ? 'layer' : 'layers'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t py-1">
            <button
              type="button"
              disabled={!activeName}
              onClick={() => {
                setOpen(false);
                onSave();
              }}
              className="block w-full text-left px-3 py-1 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSaveAs();
              }}
              className="block w-full text-left px-3 py-1 hover:bg-accent"
            >
              Save As...
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="block w-full text-left px-3 py-1 hover:bg-accent"
            >
              Manage profiles...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
