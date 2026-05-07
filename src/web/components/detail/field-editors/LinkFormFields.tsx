import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TARGET_DROPDOWN_OPTIONS,
  type TargetDropdownValue,
} from './link-target';

export interface CommonLinkFormState {
  text: string;
  targetDropdown: TargetDropdownValue;
  targetCustom: string;
  cls: string;
  title: string;
}

export const EMPTY_COMMON_FORM: CommonLinkFormState = {
  text: '',
  targetDropdown: 'Active Browser',
  targetCustom: '',
  cls: '',
  title: '',
};

interface LinkFormFieldsProps {
  form: CommonLinkFormState;
  onChange: (patch: Partial<CommonLinkFormState>) => void;
  /** When true, the Description input is enabled and tracks user typing. */
  enabled: boolean;
  /** When the user types into Description, set this so callers can suppress auto-defaulting. */
  onDescriptionTouched?: () => void;
  /** Whether to render Target / Custom inputs. Anchor link dialogs omit these. */
  includeTarget?: boolean;
}

/**
 * Shared body fields used by every Insert *Link dialog: Description (the
 * link's display text), Target + Custom (where the link opens), Style class,
 * and Alternate text (title attribute). Anchor dialog opts out of Target via
 * `includeTarget={false}` since anchor links don't honour the target attribute
 * in the content tree.
 */
export function LinkFormFields({
  form,
  onChange,
  enabled,
  onDescriptionTouched,
  includeTarget = true,
}: LinkFormFieldsProps) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Description</span>
        <Input
          aria-label="Description"
          disabled={!enabled}
          value={form.text}
          onChange={(e) => {
            onChange({ text: e.target.value });
            onDescriptionTouched?.();
          }}
        />
      </label>
      {includeTarget && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Target</span>
            <Select
              disabled={!enabled}
              value={form.targetDropdown}
              onValueChange={(v) =>
                onChange({
                  targetDropdown: v as TargetDropdownValue,
                  targetCustom: v === 'Custom' ? form.targetCustom : '',
                })
              }
            >
              <SelectTrigger aria-label="Target"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TARGET_DROPDOWN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Custom</span>
            <Input
              aria-label="Custom"
              disabled={!enabled || form.targetDropdown !== 'Custom'}
              value={form.targetCustom}
              onChange={(e) => onChange({ targetCustom: e.target.value })}
            />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Style class</span>
        <Input
          aria-label="Style class"
          disabled={!enabled}
          value={form.cls}
          onChange={(e) => onChange({ cls: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Alternate text</span>
        <Input
          aria-label="Alternate text"
          disabled={!enabled}
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
    </>
  );
}
