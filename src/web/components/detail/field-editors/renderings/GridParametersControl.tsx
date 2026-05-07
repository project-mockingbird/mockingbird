// src/web/components/detail/field-editors/renderings/GridParametersControl.tsx

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { normalizeId, parseSelected, bracedUpper } from './sxa-id-utils';

interface GridBreakpoint { key: string; displayName: string; sortOrder: number; abbr: string; }
interface GridDimension { key: string; displayName: string; tab: 'basic' | 'advanced'; }
interface GridOption { id: string; displayName: string; cssClass: string; }
interface GridCell { breakpointKey: string; dimensionKey: string; options: GridOption[]; }
interface GridData { breakpoints: GridBreakpoint[]; dimensions: GridDimension[]; cells: GridCell[]; }

interface GridParametersControlProps {
  value: string;
  options: GridData | undefined;
  loading: boolean;
  editing: boolean;
  onChange: (newPipeDelimited: string) => void;
}

const NONE_VALUE = '__none__';

export function GridParametersControl({ value, options, loading, editing, onChange }: GridParametersControlProps) {
  const [tab, setTab] = useState<'basic' | 'advanced'>('basic');
  const selectedIds = useMemo(() => parseSelected(value), [value]);

  // Flat option index keyed by normalized id, with cell-membership info.
  const optionIndex = useMemo(() => {
    const m = new Map<string, { id: string; bpKey: string; dimKey: string }>();
    if (!options) return m;
    for (const c of options.cells) {
      for (const opt of c.options) {
        m.set(normalizeId(opt.id), { id: opt.id, bpKey: c.breakpointKey, dimKey: c.dimensionKey });
      }
    }
    return m;
  }, [options]);

  // Map (bp|dim) -> currently selected option id (original braced form).
  const selectedByCell = useMemo(() => {
    const m = new Map<string, string>();
    for (const norm of selectedIds) {
      const info = optionIndex.get(norm);
      if (info) m.set(`${info.bpKey}|${info.dimKey}`, info.id);
    }
    return m;
  }, [selectedIds, optionIndex]);

  // Unknown IDs: selected GUIDs not present in any current cell. Preserved across edits.
  const unknownIds = useMemo(() => {
    const out: string[] = [];
    for (const norm of selectedIds) {
      if (!optionIndex.has(norm)) out.push(bracedUpper(norm));
    }
    return out;
  }, [selectedIds, optionIndex]);

  if (loading) return <div className="text-xs text-muted-foreground italic">Loading grid options...</div>;
  if (!options || options.breakpoints.length === 0) {
    return <div className="text-xs text-muted-foreground italic">(no grid configuration defined)</div>;
  }

  const handleCellChange = (bpKey: string, dimKey: string, newOptionId: string) => {
    const next = new Map(selectedByCell);
    if (newOptionId === NONE_VALUE) next.delete(`${bpKey}|${dimKey}`);
    else next.set(`${bpKey}|${dimKey}`, newOptionId);

    // Rebuild GUID list in canonical order (breakpoint sortOrder, then declared dimension order).
    const orderedBps = [...options.breakpoints].sort((a, b) => a.sortOrder - b.sortOrder);
    const orderedDims = options.dimensions;
    const out: string[] = [];
    for (const bp of orderedBps) {
      for (const dim of orderedDims) {
        const id = next.get(`${bp.key}|${dim.key}`);
        if (id) out.push(id);
      }
    }
    // Preserve unknown IDs at the end (deleted-grid-item safety).
    out.push(...unknownIds);
    onChange(out.join('|'));
  };

  const handleClearUnknown = (id: string) => {
    const target = normalizeId(id);
    const orderedBps = [...options.breakpoints].sort((a, b) => a.sortOrder - b.sortOrder);
    const orderedDims = options.dimensions;
    const out: string[] = [];
    for (const bp of orderedBps) {
      for (const dim of orderedDims) {
        const cellId = selectedByCell.get(`${bp.key}|${dim.key}`);
        if (cellId) out.push(cellId);
      }
    }
    out.push(...unknownIds.filter(uid => normalizeId(uid) !== target));
    onChange(out.join('|'));
  };

  const visibleDimensions = options.dimensions.filter(d => d.tab === tab);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" variant={tab === 'basic' ? 'default' : 'outline'} size="sm" onClick={() => setTab('basic')}>Basic</Button>
        <Button type="button" variant={tab === 'advanced' ? 'default' : 'outline'} size="sm" onClick={() => setTab('advanced')}>Advanced</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left font-medium pr-3 py-1"></th>
              {visibleDimensions.map(dim => (
                <th key={dim.key} className="text-left font-medium pr-3 py-1">{dim.displayName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {options.breakpoints.map(bp => (
              <tr key={bp.key}>
                <td className="font-medium pr-3 py-1">{bp.displayName}</td>
                {visibleDimensions.map(dim => {
                  const cell = options.cells.find(c => c.breakpointKey === bp.key && c.dimensionKey === dim.key);
                  const selected = selectedByCell.get(`${bp.key}|${dim.key}`) ?? NONE_VALUE;
                  return (
                    <td key={dim.key} className="pr-3 py-0.5">
                      <Select value={selected} onValueChange={v => handleCellChange(bp.key, dim.key, v)} disabled={!editing}>
                        <SelectTrigger size="sm" className="text-xs min-w-[80px]">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>(none)</SelectItem>
                          {(cell?.options ?? []).map(opt => (
                            <SelectItem key={opt.id} value={opt.id} title={opt.cssClass}>{opt.displayName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unknownIds.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
            Unknown grid selections
            <span className="text-muted-foreground font-normal"> - selected but not in current grid options; preserved on save</span>
          </div>
          <ul className="ml-2 space-y-0.5">
            {unknownIds.map(id => (
              <li key={id} className="flex items-center gap-2 text-xs">
                <span className="font-mono">{id}</span>
                {editing && (
                  <Button type="button" variant="outline" size="sm" onClick={() => handleClearUnknown(id)}>
                    Clear
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
