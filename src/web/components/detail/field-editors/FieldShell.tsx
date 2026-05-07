// src/web/components/detail/field-editors/FieldShell.tsx
import type { ReactNode } from 'react';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { fieldAnchorId } from './utils';

interface FieldShellProps {
  fieldId: string;
  label: string;
  children: ReactNode;
  onNavigate?: (id: string) => void;
}

interface GoToFieldLinkProps {
  anchor: string;
  fieldId: string;
  onNavigate?: (id: string) => void;
}

export function GoToFieldLink({ anchor, fieldId, onNavigate }: GoToFieldLinkProps) {
  if (onNavigate) {
    return (
      <button
        type="button"
        onClick={() => onNavigate(fieldId)}
        className="text-[10px] text-muted-foreground hover:text-primary"
      >
        [Go to field]
      </button>
    );
  }
  return (
    <a
      href={`#${anchor}`}
      className="text-[10px] text-muted-foreground hover:text-primary"
    >
      [Go to field]
    </a>
  );
}

/**
 * Wraps a vertical-orientation field-editor branch with:
 *   - an anchor target div carrying id="field-<unbraced-guid>"
 *   - a label row that includes a [Go to field] link
 * The horizontal-orientation Checkbox branch wraps itself separately
 * because its label sits next to the control, not above it.
 */
export function FieldShell({ fieldId, label, children, onNavigate }: FieldShellProps) {
  const anchor = fieldAnchorId(fieldId);
  return (
    <div id={anchor} tabIndex={-1}>
      <Field orientation="vertical">
        <FieldLabel className="text-xs flex items-center gap-2">
          <span>{label}</span>
          <GoToFieldLink anchor={anchor} fieldId={fieldId} onNavigate={onNavigate} />
        </FieldLabel>
        <FieldContent>{children}</FieldContent>
      </Field>
    </div>
  );
}
