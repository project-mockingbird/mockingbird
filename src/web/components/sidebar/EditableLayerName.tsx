import { useState, useRef, useEffect } from 'react';

interface EditableLayerNameProps {
  value: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Inline-editable text. Click to edit; Enter or blur to commit; Esc to cancel.
 * Trims whitespace; rejects empty/whitespace-only values silently.
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
      <span
        className={`cursor-text select-none ${className ?? ''}`}
        onClick={() => {
          if (disabled) return;
          setDraft(value);
          setEditing(true);
        }}
        title={disabled ? undefined : 'Click to rename'}
      >
        {value}
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
