import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/lib/icon';
import { mdiPencil } from '@mdi/js';

interface EditableLayerNameProps {
  value: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Inline-editable text. Click the name or the hover-revealed pencil to edit;
 * Enter or blur to commit; Esc to cancel. Trims whitespace; rejects empty/
 * whitespace-only values silently.
 */
export function EditableLayerName({ value, onChange, disabled, className }: EditableLayerNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const enterEdit = () => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setDraft(value);
      setEditing(false);
      return;
    }
    if (trimmed !== value) onChange(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span className={`group inline-flex items-center gap-1 ${className ?? ''}`}>
        <span
          className="cursor-text select-none"
          onClick={enterEdit}
          title={disabled ? undefined : 'Click to rename'}
        >
          {value}
        </span>
        {!disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Rename"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              enterEdit();
            }}
            className="hidden h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground group-hover:inline-flex group-focus-within:inline-flex"
          >
            <Icon path={mdiPencil} className="size-3" />
          </button>
        )}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      className={`bg-background border rounded px-1 text-sm w-full ${className ?? ''}`}
    />
  );
}
