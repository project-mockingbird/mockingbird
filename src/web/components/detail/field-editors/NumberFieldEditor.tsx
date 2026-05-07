// src/web/components/detail/field-editors/NumberFieldEditor.tsx
import { Input } from '@/components/ui/input';
import { FieldShell } from './FieldShell';

interface NumberFieldEditorProps {
  fieldId: string;
  label: string;
  value: string;
  editing: boolean;
  /** True for Integer (whole numbers only), false for Number (any decimal). */
  integer: boolean;
  viewMode?: 'normal' | 'raw';
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

/**
 * Number / Integer field type. Sitecore stores both as plain decimal strings
 * (no localisation). The HTML5 number input handles validation visually;
 * we let the user type any string into the underlying value so the existing
 * "edited but not yet valid" experience matches plain text fields. Out-of-
 * range or non-numeric input shows a soft warning under the field.
 */
export function NumberFieldEditor({ fieldId, label, value, editing, integer, viewMode = 'normal', onChange, onNavigate }: NumberFieldEditorProps) {
  if (viewMode === 'raw') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  const trimmed = value.trim();
  const valid =
    trimmed === '' ||
    (integer ? /^-?\d+$/.test(trimmed) : /^-?\d+(\.\d+)?$/.test(trimmed));

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <div className="flex flex-col gap-1">
        <Input
          type="number"
          step={integer ? '1' : 'any'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs"
          readOnly={!editing}
        />
        {!valid && (
          <span className="text-[10px] text-amber-500/80">
            {integer ? 'Integer expected (whole numbers only).' : 'Number expected.'}
          </span>
        )}
      </div>
    </FieldShell>
  );
}
