// src/web/components/detail/field-editors/LookupFieldEditor.tsx
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLookupSource, useItem } from '@/hooks/useItems';
import { FieldShell } from './FieldShell';
import { NONE_VALUE, normaliseGuid, bracedGuid } from './utils';

interface LookupFieldEditorProps {
  kind: 'Droplink' | 'Droplist' | 'Droptree';
  fieldId: string;
  label: string;
  value: string;
  fieldSource: string;
  contextItemId?: string;
  editing: boolean;
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

/**
 * Droplink (stores braced GUID) / Droplist (stores Name) / Droptree (stores
 * braced GUID) editor backed by the /api/lookup-source resolver. Droptree
 * shares Droplink's wire format; the difference in Sitecore is the picker UX
 * (tree vs flat dropdown), but the underlying source-resolution + storage are
 * identical so we render Droptree as a flat Select for now. A real tree
 * picker is tracked as backlog #33. Falls back to a plain text input + an
 * "(unresolved)" hint when the source string isn't one we know how to
 * handle yet (e.g. fast: queries, multi-predicate XPath, or fields without
 * a Source value).
 */
export function LookupFieldEditor({ kind, fieldId, label, value, fieldSource, contextItemId, editing, onChange, onNavigate }: LookupFieldEditorProps) {
  const { data: items, isLoading, error } = useLookupSource(fieldSource, contextItemId);
  const storesGuid = kind === 'Droplink' || kind === 'Droptree';
  const trimmedValue = value && storesGuid ? normaliseGuid(value) : '';
  const itemsList = items ?? [];
  const valueInItems = trimmedValue
    ? itemsList.some(it => normaliseGuid(it.id) === trimmedValue)
    : false;
  // Droptree fields commonly point at items nested below the source root
  // (e.g. Parameters Template = /sitecore/templates with the stored GUID
  // referencing a deeply-nested project template). Without a fallback the
  // Select trigger renders blank; fetch by ID and inject a phantom option.
  // Backlog #33 covers the proper tree-picker UX.
  const fallbackId = storesGuid && trimmedValue && !valueInItems ? trimmedValue : null;
  const { data: fallbackItem } = useItem(fallbackId);

  if (!fieldSource.trim()) {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-xs" readOnly={!editing} />
        <span className="text-[10px] text-muted-foreground">{kind} field has no Source - editing as raw text.</span>
      </FieldShell>
    );
  }

  if (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-xs" readOnly={!editing} />
        <span className="text-[10px] text-muted-foreground">Source not supported ({reason}). Editing as raw text.</span>
      </FieldShell>
    );
  }

  const selectValue = (() => {
    if (!value) return NONE_VALUE;
    if (storesGuid) return normaliseGuid(value);
    return value;
  })();

  const handleChange = (next: string) => {
    if (next === NONE_VALUE) {
      onChange('');
      return;
    }
    if (storesGuid) {
      onChange(bracedGuid(next));
      return;
    }
    onChange(next);
  };

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <Select value={selectValue} onValueChange={handleChange} disabled={!editing || isLoading}>
        <SelectTrigger size="sm" className="w-full text-xs">
          <SelectValue placeholder={isLoading ? 'Loading...' : 'Select...'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>(none)</SelectItem>
          {fallbackId && (
            <SelectItem key={`fallback-${fallbackId}`} value={fallbackId}>
              {fallbackItem?.name ?? fallbackId}
            </SelectItem>
          )}
          {itemsList.map(it => {
            const optionValue = storesGuid ? normaliseGuid(it.id) : it.name;
            return (
              <SelectItem key={it.id} value={optionValue}>
                {it.displayName || it.name}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}
