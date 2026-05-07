// src/web/components/detail/field-editors/renderings/StylesControl.tsx

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { normalizeId, parseSelected, bracedUpper } from './sxa-id-utils';

interface StyleOption { id: string; displayName: string; cssValue: string; }
interface StyleCategory { name: string; isShared: boolean; styles: StyleOption[]; }

interface StylesControlProps {
  value: string;
  categories: StyleCategory[];
  loading: boolean;
  editing: boolean;
  onChange: (newPipeDelimited: string) => void;
}

function serializeSelected(
  set: Set<string>,
  allOptionIdsByNormalized: Map<string, string>,
): string {
  // Emit known IDs in option-listing order first (stable across edits).
  const out: string[] = [];
  const seenNormalized = new Set<string>();
  for (const [normalized, original] of allOptionIdsByNormalized) {
    if (set.has(normalized)) {
      out.push(original);
      seenNormalized.add(normalized);
    }
  }
  // Then preserve any selected IDs we don't recognize (deleted styles, restricted styles, etc.).
  // Without this, toggling another style would silently drop them.
  for (const normalized of set) {
    if (!seenNormalized.has(normalized)) {
      // Re-brace + uppercase so wire format stays consistent.
      out.push(bracedUpper(normalized));
    }
  }
  return out.join('|');
}

export function StylesControl({ value, categories, loading, editing, onChange }: StylesControlProps) {
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState<'all' | 'selected'>('all');

  const selectedIds = useMemo(() => parseSelected(value), [value]);
  const allOptionIdsByNormalized = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) {
      for (const s of c.styles) {
        m.set(normalizeId(s.id), s.id);
      }
    }
    return m;
  }, [categories]);

  const toggle = (styleId: string) => {
    const next = new Set(selectedIds);
    const norm = normalizeId(styleId);
    if (next.has(norm)) next.delete(norm);
    else next.add(norm);
    onChange(serializeSelected(next, allOptionIdsByNormalized));
  };

  const unknownIds = useMemo(() => {
    const out: string[] = [];
    for (const id of selectedIds) {
      if (!allOptionIdsByNormalized.has(id)) {
        out.push(bracedUpper(id));
      }
    }
    return out;
  }, [selectedIds, allOptionIdsByNormalized]);

  if (loading) return <div className="text-xs text-muted-foreground italic">Loading styles...</div>;
  if (categories.length === 0) {
    return <div className="text-xs text-muted-foreground italic">(no styles defined)</div>;
  }

  const filterLower = filter.toLowerCase();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by style name or CSS class"
          className="text-xs flex-1 min-w-[180px]"
        />
        <Button type="button" variant={mode === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setMode('all')}>Show all</Button>
        <Button type="button" variant={mode === 'selected' ? 'default' : 'outline'} size="sm" onClick={() => setMode('selected')}>Show selected</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setFilter(''); setMode('all'); }}>Clear</Button>
      </div>

      <div className="space-y-3">
        {categories.map(cat => {
          const visibleStyles = cat.styles.filter(s => {
            if (mode === 'selected' && !selectedIds.has(normalizeId(s.id))) return false;
            if (filter && !s.displayName.toLowerCase().includes(filterLower) && !s.cssValue.toLowerCase().includes(filterLower)) return false;
            return true;
          });
          if (visibleStyles.length === 0) return null;
          return (
            <div key={cat.name}>
              <div className="text-xs font-bold mb-1">
                {cat.name} {cat.isShared && <span className="text-muted-foreground font-normal">(Shared)</span>}
              </div>
              <div className="ml-2 space-y-0.5">
                {visibleStyles.map(s => {
                  const isSel = selectedIds.has(normalizeId(s.id));
                  return (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer" title={s.cssValue}>
                      <Checkbox
                        checked={isSel}
                        disabled={!editing}
                        onCheckedChange={() => toggle(s.id)}
                      />
                      {s.displayName}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        {unknownIds.length > 0 && (
          <div>
            <div className="text-xs font-bold mb-1 text-amber-600 dark:text-amber-400">
              Unknown styles
              <span className="text-muted-foreground font-normal"> - selected but not available for this rendering; preserved on save</span>
            </div>
            <div className="ml-2 space-y-0.5">
              {unknownIds.map(id => (
                <label key={id} className="flex items-center gap-2 text-xs cursor-pointer" title={id}>
                  <Checkbox
                    checked={true}
                    disabled={!editing}
                    onCheckedChange={() => toggle(id)}
                  />
                  <span className="font-mono">{id}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
