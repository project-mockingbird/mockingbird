/**
 * Target dropdown values shown in the Insert Link dialog. Matches Sitecore CE
 * default Link Manager (3 options): Active Browser / New Browser / Custom.
 * Other HTML target attribute values (e.g. `_self`, `_parent`, `_top`) round-
 * trip through the Custom slot so the value is preserved without expanding the
 * dropdown beyond the CE default.
 */
export type TargetDropdownValue =
  | 'Active Browser'
  | 'New Browser'
  | 'Custom';

export interface TargetDropdownOption {
  value: TargetDropdownValue;
  /** What to write to the link's `target` XML attribute (when not Custom). */
  attribute: string;
}

export const TARGET_DROPDOWN_OPTIONS: ReadonlyArray<TargetDropdownOption> = [
  { value: 'Active Browser', attribute: '' },
  { value: 'New Browser',    attribute: '_blank' },
  { value: 'Custom',         attribute: '' }, // attribute supplied by separate input
];

const ATTR_TO_DROPDOWN: Record<string, TargetDropdownValue> = {
  '':       'Active Browser',
  '_blank': 'New Browser',
};

export function mapTargetDropdownToAttribute(
  dropdown: TargetDropdownValue,
  custom: string,
): string {
  if (dropdown === 'Custom') return custom;
  const opt = TARGET_DROPDOWN_OPTIONS.find(o => o.value === dropdown);
  return opt?.attribute ?? '';
}

export function mapTargetAttributeToDropdown(
  attribute: string,
): { dropdown: TargetDropdownValue; custom: string } {
  const known = ATTR_TO_DROPDOWN[attribute];
  if (known !== undefined) return { dropdown: known, custom: '' };
  return { dropdown: 'Custom', custom: attribute };
}
