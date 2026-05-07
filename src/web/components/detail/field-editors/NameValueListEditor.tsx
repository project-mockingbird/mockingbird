// src/web/components/detail/field-editors/NameValueListEditor.tsx
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Icon } from '@/lib/icon';
import { mdiDelete, mdiPlus } from '@mdi/js';
import { useLookupSource, useItem } from '@/hooks/useItems';
import { FieldShell } from './FieldShell';
import { NONE_VALUE, normaliseGuid, bracedGuid } from './utils';

interface NameValueListEditorProps {
  /**
   * - NameValueList            : free-text key + free-text value.
   * - NameLookupValueList      : free-text key + Sitecore item picker on value
   *                              (Source resolves to value-column items).
   * - LookupNameLookupValueList: BOTH columns are pickers. Source is split on
   *                              `||` (`<keySource>||<valueSource>`), each
   *                              half resolved independently. Wire format
   *                              double-URL-encodes the value per Sitecore's
   *                              SXA TemplatesMapping convention.
   */
  kind: 'NameValueList' | 'NameLookupValueList' | 'LookupNameLookupValueList';
  fieldId: string;
  label: string;
  value: string;
  /**
   * Required for both lookup variants.
   * - NameLookupValueList: a single Source string for the value column.
   * - LookupNameLookupValueList: `<keySource>||<valueSource>`.
   */
  fieldSource: string;
  contextItemId?: string;
  editing: boolean;
  viewMode?: 'normal' | 'raw';
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

type Pair = { localId: number; key: string; value: string };

let nextLocalId = 0;
const freshId = () => ++nextLocalId;

/**
 * Sitecore's NameValueListField wire format mirrors `HttpUtility.UrlEncode`:
 * pairs separated by `&`, each pair is `<encoded-key>=<encoded-value>`,
 * spaces encode as `+` (not `%20`). `decode`/`encode` here translate
 * between that form and the raw strings the user types.
 */
function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

function encode(s: string): string {
  return encodeURIComponent(s).replace(/%20/g, '+');
}

export function parseNameValueListValue(s: string): { key: string; value: string }[] {
  if (!s) return [];
  return s.split('&').filter(Boolean).map(part => {
    const eq = part.indexOf('=');
    if (eq < 0) return { key: decode(part), value: '' };
    return { key: decode(part.slice(0, eq)), value: decode(part.slice(eq + 1)) };
  });
}

export function serializeNameValueListValue(pairs: { key: string; value: string }[]): string {
  return pairs
    .filter(p => p.key.length > 0)
    .map(p => `${encode(p.key)}=${encode(p.value)}`)
    .join('&');
}

/**
 * SXA TemplatesMapping (`Lookup Name Lookup Value List`) wire format.
 * Asymmetric double-URL-encoding:
 *   1. Build inner pair list: `{rawKey}=<encoded(rawValue)>&{rawKey2}=...`
 *      (key column is RAW, value column is URL-encoded once)
 *   2. URL-encode the entire inner string
 * Net result: keys are encoded once (by step 2 only), values are encoded
 * twice. Round-trip = decode whole thing, split on `&`/`=`, then decode
 * the value half a second time.
 *
 * Note: encodeURIComponent emits uppercase percent-encoded hex while
 * Sitecore's HttpUtility.UrlEncode emits lowercase. Round-tripping through
 * this editor will normalise to uppercase, producing a no-op cosmetic
 * diff vs values written directly by Sitecore CM. Decoders are
 * case-insensitive so functionality is unaffected.
 */
export function parseLookupNameLookupValueListValue(s: string): { key: string; value: string }[] {
  if (!s) return [];
  const outerDecoded = decode(s);
  return outerDecoded.split('&').filter(Boolean).map(part => {
    const eq = part.indexOf('=');
    if (eq < 0) return { key: part, value: '' };
    return {
      key: part.slice(0, eq),
      value: decode(part.slice(eq + 1)),
    };
  });
}

export function serializeLookupNameLookupValueListValue(
  pairs: { key: string; value: string }[],
): string {
  const inner = pairs
    .filter(p => p.key.length > 0)
    .map(p => `${p.key}=${encode(p.value)}`)
    .join('&');
  return encode(inner);
}

function parseToPairs(s: string, kind: NameValueListEditorProps['kind']): Pair[] {
  const parsed = kind === 'LookupNameLookupValueList'
    ? parseLookupNameLookupValueListValue(s)
    : parseNameValueListValue(s);
  return parsed.map(p => ({ localId: freshId(), ...p }));
}

function serializePairs(pairs: Pair[], kind: NameValueListEditorProps['kind']): string {
  return kind === 'LookupNameLookupValueList'
    ? serializeLookupNameLookupValueListValue(pairs)
    : serializeNameValueListValue(pairs);
}

export function NameValueListEditor({
  kind, fieldId, label, value, fieldSource, contextItemId, editing, viewMode = 'normal',
  onChange, onNavigate,
}: NameValueListEditorProps) {
  const [pairs, setPairs] = useState<Pair[]>(() => parseToPairs(value, kind));
  // Track the last value we emitted via onChange. When the prop value
  // changes for any other reason (external revert / live-update), we
  // re-parse from the prop. This avoids clobbering local in-progress
  // empty rows on every keystroke (we'd otherwise lose them when the
  // serialised form round-trips through the parent and lands back).
  const lastEmitted = useRef<string>(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setPairs(parseToPairs(value, kind));
      lastEmitted.current = value;
    }
  }, [value, kind]);

  // For the LNLVL variant, split the field's `Source` into key + value source
  // strings on `||`. Empty splits fall through to raw-input fallbacks.
  const [keySource, valueSourceLnlvl] = (() => {
    if (kind !== 'LookupNameLookupValueList') return ['', ''] as const;
    const idx = fieldSource.indexOf('||');
    if (idx < 0) return [fieldSource.trim(), ''] as const;
    return [fieldSource.slice(0, idx).trim(), fieldSource.slice(idx + 2).trim()] as const;
  })();

  if (viewMode === 'raw') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  const commit = (next: Pair[]) => {
    setPairs(next);
    const serialized = serializePairs(next, kind);
    lastEmitted.current = serialized;
    onChange(serialized);
  };

  const updatePair = (id: number, patch: Partial<Pick<Pair, 'key' | 'value'>>) => {
    commit(pairs.map(p => p.localId === id ? { ...p, ...patch } : p));
  };
  const removePair = (id: number) => commit(pairs.filter(p => p.localId !== id));
  const addPair = () => commit([...pairs, { localId: freshId(), key: '', value: '' }]);

  const renderKeyCell = (p: Pair) => {
    if (kind === 'LookupNameLookupValueList') {
      return (
        <LookupCell
          value={p.key}
          fieldSource={keySource}
          contextItemId={contextItemId}
          editing={editing}
          placeholder="Select..."
          onChange={(next) => updatePair(p.localId, { key: next })}
        />
      );
    }
    return (
      <Input
        value={p.key}
        onChange={(e) => updatePair(p.localId, { key: e.target.value })}
        placeholder="name"
        className="text-xs flex-1"
        readOnly={!editing}
      />
    );
  };

  const renderValueCell = (p: Pair) => {
    if (kind === 'NameLookupValueList') {
      return (
        <LookupCell
          value={p.value}
          fieldSource={fieldSource}
          contextItemId={contextItemId}
          editing={editing}
          placeholder="Select..."
          onChange={(next) => updatePair(p.localId, { value: next })}
        />
      );
    }
    if (kind === 'LookupNameLookupValueList') {
      return (
        <LookupCell
          value={p.value}
          fieldSource={valueSourceLnlvl}
          contextItemId={contextItemId}
          editing={editing}
          placeholder="Select..."
          onChange={(next) => updatePair(p.localId, { value: next })}
        />
      );
    }
    return (
      <Input
        value={p.value}
        onChange={(e) => updatePair(p.localId, { value: e.target.value })}
        placeholder="value"
        className="text-xs flex-1"
        readOnly={!editing}
      />
    );
  };

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <div className="flex flex-col gap-1">
        {pairs.length === 0 && (
          <span className="text-[10px] text-muted-foreground">No entries.</span>
        )}
        {pairs.map(p => (
          <div key={p.localId} className="flex items-center gap-1">
            {renderKeyCell(p)}
            <span className="text-muted-foreground text-xs select-none">=</span>
            {renderValueCell(p)}
            {editing && (
              <button
                type="button"
                onClick={() => removePair(p.localId)}
                aria-label="Remove row"
                className="text-muted-foreground hover:text-destructive size-6 flex items-center justify-center"
              >
                <Icon path={mdiDelete} size={0.6} />
              </button>
            )}
          </div>
        ))}
        {editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPair}
            className="self-start text-xs h-7 mt-1"
          >
            <Icon path={mdiPlus} size={0.55} className="mr-1" />
            Add row
          </Button>
        )}
      </div>
    </FieldShell>
  );
}

interface LookupCellProps {
  value: string;
  fieldSource: string;
  contextItemId?: string;
  editing: boolean;
  placeholder: string;
  onChange: (next: string) => void;
}

/**
 * One picker cell. Resolves the field's Source via useLookupSource and
 * renders a Select; falls back to a raw-GUID Input when the source is
 * unset / the resolver returned `resolved: false` (e.g. unsupported
 * query syntax). Mirrors LookupFieldEditor's fallback shape.
 *
 * When the stored GUID doesn't appear in the source-resolved items
 * (typical for SXA TemplatesMapping where the keySource resolves to
 * direct children of $templates but stored keys reference deeply-nested
 * project templates), the cell fetches the item by ID and adds a
 * phantom option so the trigger shows the real item name. Editing nested
 * targets via the dropdown still won't work - the source returns only
 * what it returns - but at least the existing data displays correctly.
 * Real fix is the tree-picker (backlog #33).
 */
function LookupCell({ value, fieldSource, contextItemId, editing, placeholder, onChange }: LookupCellProps) {
  const { data: items, isLoading, error } = useLookupSource(fieldSource, contextItemId);

  const trimmedValue = value ? normaliseGuid(value) : '';
  const itemsList = items ?? [];
  const valueInItems = trimmedValue
    ? itemsList.some(it => normaliseGuid(it.id) === trimmedValue)
    : false;
  const fallbackId = trimmedValue && !valueInItems ? trimmedValue : null;
  const { data: fallbackItem } = useItem(fallbackId);

  if (!fieldSource.trim() || error) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="(item GUID)"
        className="text-xs flex-1 font-mono"
        readOnly={!editing}
      />
    );
  }

  const selectValue = value ? normaliseGuid(value) : NONE_VALUE;
  return (
    <Select
      value={selectValue}
      onValueChange={(next) => onChange(next === NONE_VALUE ? '' : bracedGuid(next))}
      disabled={!editing || isLoading}
    >
      <SelectTrigger size="sm" className="flex-1 text-xs">
        <SelectValue placeholder={isLoading ? 'Loading...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>(none)</SelectItem>
        {fallbackId && (
          <SelectItem key={`fallback-${fallbackId}`} value={fallbackId}>
            {fallbackItem?.name ?? fallbackId}
          </SelectItem>
        )}
        {itemsList.map(it => (
          <SelectItem key={it.id} value={normaliseGuid(it.id)}>
            {it.displayName || it.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
