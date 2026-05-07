import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  mapTargetAttributeToDropdown,
  mapTargetDropdownToAttribute,
} from './link-target';
import {
  EMPTY_COMMON_FORM,
  LinkFormFields,
  type CommonLinkFormState,
} from './LinkFormFields';
import {
  serializeExternalLinkXml,
  type ParsedLink,
} from './GeneralLinkFieldEditor';

export interface InsertExternalLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (xml: string) => void;
  existing: ParsedLink | null;
}

interface FormState extends CommonLinkFormState {
  url: string;
}

const EMPTY_FORM: FormState = { ...EMPTY_COMMON_FORM, url: '' };

function formFromExisting(existing: ParsedLink | null): FormState {
  if (!existing || existing.linktype !== 'external') return { ...EMPTY_FORM };
  const { dropdown, custom } = mapTargetAttributeToDropdown(existing.target ?? '');
  return {
    text: existing.text ?? '',
    targetDropdown: dropdown,
    targetCustom: custom,
    cls: existing.class ?? '',
    title: existing.title ?? '',
    url: existing.url ?? '',
  };
}

export function InsertExternalLinkDialog({
  open,
  onOpenChange,
  onInsert,
  existing,
}: InsertExternalLinkDialogProps) {
  const [form, setForm] = useState<FormState>(() => formFromExisting(existing));

  useEffect(() => {
    if (!open) return;
    setForm(formFromExisting(existing));
  }, [open, existing]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const disabled = form.url.trim() === '';

  const handleInsert = () => {
    if (disabled) return;
    const target = mapTargetDropdownToAttribute(form.targetDropdown, form.targetCustom);
    onInsert(serializeExternalLinkXml({
      text: form.text,
      url: form.url,
      target,
      title: form.title,
      class: form.cls,
    }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Insert External Link</DialogTitle>
          <DialogDescription>
            Enter the URL for the external website that you want to insert a link to and specify any additional properties for the link.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">URL</span>
            <Input
              aria-label="URL"
              value={form.url}
              onChange={(e) => patch({ url: e.target.value })}
            />
          </label>
          <LinkFormFields form={form} onChange={patch} enabled />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={disabled} onClick={handleInsert}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
