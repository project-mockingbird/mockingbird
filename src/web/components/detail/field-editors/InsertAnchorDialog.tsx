import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { serializeAnchorLinkXml, type ParsedLink } from './GeneralLinkFieldEditor';

export interface InsertAnchorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (xml: string) => void;
  existing: ParsedLink | null;
}

interface FormState {
  text: string;
  anchor: string;
  title: string;
  cls: string;
}

const EMPTY_FORM: FormState = { text: '', anchor: '', title: '', cls: '' };

function formFromExisting(existing: ParsedLink | null): FormState {
  if (!existing || existing.linktype !== 'anchor') return { ...EMPTY_FORM };
  return {
    text: existing.text ?? '',
    anchor: existing.anchor ?? '',
    title: existing.title ?? '',
    cls: existing.class ?? '',
  };
}

export function InsertAnchorDialog({
  open,
  onOpenChange,
  onInsert,
  existing,
}: InsertAnchorDialogProps) {
  const [form, setForm] = useState<FormState>(() => formFromExisting(existing));

  useEffect(() => {
    if (!open) return;
    setForm(formFromExisting(existing));
  }, [open, existing]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const disabled = form.anchor.trim() === '';

  const handleInsert = () => {
    if (disabled) return;
    onInsert(serializeAnchorLinkXml({
      text: form.text,
      anchor: form.anchor,
      title: form.title,
      class: form.cls,
    }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Insert Anchor</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Text</span>
            <Input
              aria-label="Text"
              value={form.text}
              onChange={(e) => patch({ text: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Anchor</span>
            <Input
              aria-label="Anchor"
              value={form.anchor}
              onChange={(e) => patch({ anchor: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Alternate text</span>
            <Input
              aria-label="Alternate text"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Style</span>
            <Input
              aria-label="Style"
              value={form.cls}
              onChange={(e) => patch({ cls: e.target.value })}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={disabled} onClick={handleInsert}>Insert anchor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
