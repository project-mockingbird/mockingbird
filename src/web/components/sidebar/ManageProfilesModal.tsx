import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import { mdiPencil, mdiTrashCanOutline, mdiCheck, mdiClose } from '@mdi/js';
import type { ProfileSummary } from '@/hooks/useProfiles';

interface ManageProfilesModalProps {
  open: boolean;
  profiles: ProfileSummary[];
  activeName: string | null;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}

export function ManageProfilesModal({
  open,
  profiles,
  activeName,
  onClose,
  onRename,
  onDelete,
}: ManageProfilesModalProps) {
  const [editing, setEditing] = useState<{ name: string; value: string } | null>(null);

  const commitRename = () => {
    if (!editing) return;
    const trimmed = editing.value.trim();
    if (trimmed.length > 0 && trimmed !== editing.name) {
      onRename(editing.name, trimmed);
    }
    setEditing(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Manage profiles</DialogTitle>
        </DialogHeader>
        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">No profiles for this project yet.</p>
        ) : (
          <ul className="divide-y border rounded">
            {profiles.map((p) => {
              const isActive = p.name === activeName;
              const isEditing = editing?.name === p.name;
              return (
                <li key={p.name} className="flex items-center gap-3 p-3 text-sm">
                  {isEditing ? (
                    <>
                      <input
                        value={editing!.value}
                        onChange={(e) => setEditing({ name: p.name, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        autoFocus
                        className="flex-1 rounded border bg-background px-2 py-1"
                      />
                      <Button size="sm" variant="ghost" onClick={commitRename} aria-label="Confirm rename">
                        <Icon path={mdiCheck} className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel rename">
                        <Icon path={mdiClose} className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.layerCount} {p.layerCount === 1 ? 'layer' : 'layers'} - {p.updatedAt}
                        </div>
                      </div>
                      {isActive && <span className="text-xs text-muted-foreground">active</span>}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing({ name: p.name, value: p.name })}
                        aria-label={`Rename ${p.name}`}
                      >
                        <Icon path={mdiPencil} className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isActive}
                        onClick={() => {
                          if (confirm(`Delete profile ${p.name}? This cannot be undone.`)) onDelete(p.name);
                        }}
                        aria-label={`Delete ${p.name}`}
                      >
                        <Icon path={mdiTrashCanOutline} className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button onClick={onClose} variant="outline" size="sm">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
