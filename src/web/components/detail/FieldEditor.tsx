import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFieldTypes } from '@/hooks/useValidation';
import { FieldShell, GoToFieldLink, LookupFieldEditor, TreelistFieldEditor, ImageFieldEditor, GeneralLinkFieldEditor, DatetimeFieldEditor, NumberFieldEditor, NameValueListEditor, RenderingsFieldEditor, fieldAnchorId } from './field-editors';
import { normalizeFieldType } from './field-editors/utils';

interface FieldEditorProps {
  fieldId: string;
  hint: string;
  value: string;
  fieldType?: string;
  fieldSource?: string;
  contextItemId?: string;
  viewMode?: 'normal' | 'raw';
  resolvedValue?: string;
  isEdited?: boolean;
  editing?: boolean;
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

// Sitecore's Field-type definitions live under /sitecore/system/Field types/
// and are looked up case-insensitively. The OOTB content tree stores both modern
// (e.g. "Treelist", "Checkbox") and legacy (e.g. "tree list", "checkbox")
// spellings of the same field type. Sets here use lowercased forms;
// `normalizeFieldType` lowercases the field-type input before comparison
// so both spellings route to the same editor. Aliases that differ beyond
// casing (e.g. "tree list" vs "treelist") are listed explicitly.
export const MULTILINE_TYPES = new Set([
  'multi-line text',
  'multiline text',
  'rich text',
  'html',
  'memo',
  // SXA Component GraphQL Query field. Source attribute is empty; rendered
  // as a monospace textarea so query indentation round-trips intact.
  'graphql',
]);

const CHECKBOX_TYPES = new Set([
  'checkbox',
]);

const TREELIST_FIELD_TYPES = new Set([
  'treelist',
  'tree list',          // legacy spelling - used by the Standard template's __Base template field
  'treelistex',
  'treelist with search',
  'treelistex with search',
  'tag treelist',
  'multiroot treelist', // SXA variant
  'multi-root treelist',
]);

const MULTILIST_FIELD_TYPES = new Set([
  'multilist',
  'multilist with search',
]);

function isLikelyCheckbox(hint: string, value: string, fieldType?: string): boolean {
  if (fieldType) return CHECKBOX_TYPES.has(normalizeFieldType(fieldType));
  const v = value.trim();
  // Require a positive '0'/'1' signal. An empty string is ambiguous - many
  // unset fields (Single-Line Text, NameValueList, etc.) round-trip as '',
  // and inferring "checkbox" from emptiness alone misroutes them. The
  // checkbox guess is reserved for actual boolean wire-format values.
  if (v !== '0' && v !== '1') return false;
  const h = hint.toLowerCase();
  if (h.includes('date') || h.includes('created') || h.includes('sortorder') || h.includes('revision')) return false;
  return true;
}

export function FieldEditor({ fieldId, hint, value, fieldType, fieldSource, contextItemId, viewMode = 'normal', resolvedValue, isEdited, editing = true, onChange, onNavigate }: FieldEditorProps) {
  const { data: fieldTypes } = useFieldTypes();
  const label = hint || fieldId;
  const ftn = normalizeFieldType(fieldType);

  const showResolved = viewMode === 'normal' && !isEdited && resolvedValue !== undefined && resolvedValue !== value;
  const displayValue = showResolved ? resolvedValue! : value;

  if (ftn === 'type' || fieldId === 'ab162cc0-dc80-4abf-8871-998ee5d7ba32') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Select value={value} onValueChange={onChange} disabled={!editing}>
          <SelectTrigger size="sm" className="w-full text-xs">
            <SelectValue placeholder="Select type..." />
          </SelectTrigger>
          <SelectContent>
            {fieldTypes?.map(ft => (
              <SelectItem key={ft} value={ft}>{ft}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    );
  }

  const FINAL_RENDERINGS_FIELD_ID = '04bf00db-f5fb-41f7-8ab7-22408372a981';
  const RENDERINGS_FIELD_ID = 'f1a1fe9e-a60c-4ddb-a3a7-6f8e9f0e7ae3';
  if (
    ftn === 'layout' ||
    ftn === 'final renderings' ||
    fieldId.toLowerCase().replace(/[{}]/g, '') === FINAL_RENDERINGS_FIELD_ID ||
    fieldId.toLowerCase().replace(/[{}]/g, '') === RENDERINGS_FIELD_ID
  ) {
    if (!contextItemId) {
      // Without a context item, we can't render the editor. Fall through to multiline.
    } else {
      return (
        <RenderingsFieldEditor
          fieldId={fieldId}
          label={label}
          value={value}
          contextItemId={contextItemId}
          editing={editing}
          viewMode={viewMode}
          onChange={onChange}
          onNavigate={onNavigate}
        />
      );
    }
  }

  if (ftn === 'droplink' || ftn === 'droplist' || ftn === 'droptree') {
    const lookupKind =
      ftn === 'droplink' ? 'Droplink'
      : ftn === 'droplist' ? 'Droplist'
      : 'Droptree';
    return (
      <LookupFieldEditor
        kind={lookupKind}
        fieldId={fieldId}
        label={label}
        value={value}
        fieldSource={fieldSource ?? ''}
        contextItemId={contextItemId}
        editing={editing}
        onChange={onChange}
        onNavigate={onNavigate}
      />
    );
  }

  if (ftn && (TREELIST_FIELD_TYPES.has(ftn) || MULTILIST_FIELD_TYPES.has(ftn))) {
    const isMultilist = MULTILIST_FIELD_TYPES.has(ftn);
    return (
      <TreelistFieldEditor
        fieldId={fieldId}
        label={label}
        value={value}
        fieldSource={fieldSource ?? ''}
        contextItemId={contextItemId}
        editing={editing}
        viewMode={viewMode}
        flat={isMultilist}
        showSelectAll={isMultilist}
        onChange={onChange}
        onNavigate={onNavigate}
      />
    );
  }

  if (ftn === 'image') {
    return (
      <ImageFieldEditor
        fieldId={fieldId}
        label={label}
        value={value}
        editing={editing}
        viewMode={viewMode}
        fieldSource={fieldSource}
        contextItemId={contextItemId}
        onChange={onChange}
        onNavigate={onNavigate}
      />
    );
  }

  if (ftn === 'general link') {
    return (
      <GeneralLinkFieldEditor
        fieldId={fieldId}
        label={label}
        value={value}
        editing={editing}
        viewMode={viewMode}
        fieldSource={fieldSource}
        contextItemId={contextItemId}
        onChange={onChange}
        onNavigate={onNavigate}
      />
    );
  }

  if (ftn === 'datetime' || ftn === 'date') {
    return (
      <DatetimeFieldEditor
        fieldId={fieldId}
        label={label}
        value={value}
        editing={editing}
        withTime={ftn === 'datetime'}
        viewMode={viewMode}
        onChange={onChange}
        onNavigate={onNavigate}
      />
    );
  }

  if (ftn === 'number' || ftn === 'integer') {
    return (
      <NumberFieldEditor
        fieldId={fieldId}
        label={label}
        value={value}
        editing={editing}
        integer={ftn === 'integer'}
        viewMode={viewMode}
        onChange={onChange}
        onNavigate={onNavigate}
      />
    );
  }

  if (
    ftn === 'name value list'
    || ftn === 'name lookup value list'
    || ftn === 'lookup name lookup value list'
  ) {
    const nvlKind =
      ftn === 'lookup name lookup value list' ? 'LookupNameLookupValueList'
      : ftn === 'name lookup value list' ? 'NameLookupValueList'
      : 'NameValueList';
    return (
      <NameValueListEditor
        kind={nvlKind}
        fieldId={fieldId}
        label={label}
        value={value}
        fieldSource={fieldSource ?? ''}
        contextItemId={contextItemId}
        editing={editing}
        viewMode={viewMode}
        onChange={onChange}
        onNavigate={onNavigate}
      />
    );
  }

  // Password field: Sitecore stores the value in plaintext (these fields
  // are round-trippable, not hashed), so the security concern is purely
  // shoulder-surfing. The browser's native `type="password"` masking +
  // autocomplete-off handles that. Raw view still shows the value
  // unmasked so editors can verify what's stored on disk.
  if (ftn === 'password') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Input
          type={viewMode === 'raw' ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs"
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  const isCheckbox = isLikelyCheckbox(hint, value, fieldType);
  const isMultiLine = ftn ? MULTILINE_TYPES.has(ftn) : displayValue.includes('\n');

  if (isCheckbox) {
    const anchor = fieldAnchorId(fieldId);
    return (
      <div id={anchor} tabIndex={-1}>
        <Field orientation="horizontal">
          <Checkbox
            checked={value.trim() === '1'}
            onCheckedChange={(c) => onChange(c ? '1' : '0')}
            disabled={!editing}
          />
          <FieldContent>
            <FieldLabel className="text-xs flex items-center gap-2">
              <span>{label}</span>
              <GoToFieldLink anchor={anchor} fieldId={fieldId} onNavigate={onNavigate} />
            </FieldLabel>
          </FieldContent>
        </Field>
      </div>
    );
  }

  if (isMultiLine) {
    // GraphQL queries (SXA Component Query field) commonly span 50+ lines;
    // default to a 600px editor so the whole query fits without scrolling.
    const heightClass = ftn === 'graphql' ? 'min-h-[600px]' : 'min-h-24';
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Textarea
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          className={`${heightClass} font-mono text-xs`}
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <Input value={displayValue} onChange={(e) => onChange(e.target.value)} className="text-xs" readOnly={!editing} />
    </FieldShell>
  );
}
