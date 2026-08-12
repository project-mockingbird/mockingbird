// src/web/components/detail/ChangeIconDialog.tsx
//
// Modal for picking a new __Icon value for the selected item: browse by
// category, filter by filename, or pick from recently-used icons. Mirrors
// Sitecore's "Change Icon" dialog - click a tile, confirm with OK.

import { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useIconCategories, useIconList, useSetIcon } from '@/hooks/useIconPicker';
import {
  filterIcons, iconDisplayName, readRecentIcons, addRecentIcon, writeRecentIcons,
} from '@/lib/icon-picker';
import { spriteIconSrc } from '@/lib/sprite-icon';

/** Max grid cells rendered at once; beyond this we show a refine-the-filter hint. */
const MAX_GRID = 500;

interface Props {
  itemId: string;
  currentIcon: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ChangeIconDialog({ itemId, currentIcon, open, onOpenChange }: Props) {
  const { data: categories } = useIconCategories();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(currentIcon);
  const [tab, setTab] = useState<'icons' | 'recent'>('icons');
  const setIcon = useSetIcon(itemId);

  // Default the category to the current icon's folder when known, else the first.
  useEffect(() => {
    if (!open || category || !categories?.length) return;
    const folder = currentIcon?.includes('/') ? currentIcon.split('/')[0] : null;
    const match = folder && categories.find(c => c.key.toLowerCase() === folder.toLowerCase());
    setCategory(match ? match.key : categories[0].key);
  }, [open, categories, currentIcon, category]);

  // Reset transient state each time the dialog opens. Clearing category here
  // (not just selected/query/tab) lets the category-default effect above
  // re-derive it from this open's currentIcon instead of keeping whatever
  // category a prior item resolved to.
  useEffect(() => {
    if (open) { setSelected(currentIcon); setQuery(''); setTab('icons'); setCategory(null); }
  }, [open, currentIcon]);

  const { data: allIcons } = useIconList(tab === 'icons' ? category : null);
  const recent = useMemo(() => (open ? readRecentIcons() : []), [open]);

  const source = tab === 'recent' ? recent : (allIcons ?? []);
  const filtered = useMemo(() => filterIcons(source, query), [source, query]);
  const shown = filtered.slice(0, MAX_GRID);
  const overflow = filtered.length - shown.length;

  const canSave = !!selected && selected !== currentIcon && !setIcon.isPending;

  async function handleSave() {
    if (!selected) return;
    try {
      await setIcon.mutateAsync(selected);
      writeRecentIcons(addRecentIcon(readRecentIcons(), selected));
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to change icon: ${err instanceof Error ? err.message : String(err)}`);
      // Leave the dialog open so the user can retry or pick a different icon.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Change Icon</DialogTitle>
          <DialogDescription>Click the new icon that you want to assign to the selected item.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'icons' | 'recent')}>
          <TabsList>
            <TabsTrigger value="icons">Icons</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>

          <TabsContent value="icons" className="space-y-2">
            <div className="flex items-center gap-2">
              <Select value={category ?? undefined} onValueChange={(v) => setCategory(v)}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  {categories?.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Filter icons..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <IconGrid paths={shown} selected={selected} onPick={setSelected} />
            {overflow > 0 && (
              <p className="text-xs text-muted-foreground">{overflow} more - refine with the filter.</p>
            )}
          </TabsContent>

          <TabsContent value="recent">
            {recent.length === 0
              ? <p className="text-sm text-muted-foreground py-6 text-center">No recent icons yet.</p>
              : <IconGrid paths={filterIcons(recent, query)} selected={selected} onPick={setSelected} />}
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Icon:</span>
          <code className="rounded bg-muted px-2 py-1">{selected ?? ''}</code>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IconGrid({ paths, selected, onPick }: { paths: string[]; selected: string | null; onPick: (p: string) => void }) {
  return (
    <div className="grid grid-cols-12 gap-1 max-h-80 overflow-auto p-1 rounded border">
      {paths.map((p) => (
        <button
          key={p}
          type="button"
          title={iconDisplayName(p)}
          onClick={() => onPick(p)}
          className={`flex items-center justify-center p-1 rounded hover:bg-accent ${selected === p ? 'ring-2 ring-primary bg-accent' : ''}`}
        >
          <img
            src={spriteIconSrc(p) ?? ''}
            alt={iconDisplayName(p)}
            width={32}
            height={32}
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
          />
        </button>
      ))}
    </div>
  );
}
