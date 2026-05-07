import { describe, it, expect } from 'vitest';
import {
  TARGET_DROPDOWN_OPTIONS,
  mapTargetDropdownToAttribute,
  mapTargetAttributeToDropdown,
  type TargetDropdownValue,
} from './link-target';

describe('TARGET_DROPDOWN_OPTIONS', () => {
  it('exposes the three Sitecore CE default target options in display order', () => {
    expect(TARGET_DROPDOWN_OPTIONS.map(o => o.value)).toEqual([
      'Active Browser',
      'New Browser',
      'Custom',
    ]);
  });
});

describe('mapTargetDropdownToAttribute', () => {
  const cases: Array<[TargetDropdownValue, string, string]> = [
    ['Active Browser', '', ''],
    ['New Browser', '', '_blank'],
    ['Custom', 'my-frame', 'my-frame'],
    ['Custom', '', ''],
  ];
  it.each(cases)('%s + custom=%j -> %j', (dropdown, custom, expected) => {
    expect(mapTargetDropdownToAttribute(dropdown, custom)).toBe(expected);
  });
});

describe('mapTargetAttributeToDropdown', () => {
  it('classifies known target attribute values to their dropdown labels', () => {
    expect(mapTargetAttributeToDropdown('')).toEqual({ dropdown: 'Active Browser', custom: '' });
    expect(mapTargetAttributeToDropdown('_blank')).toEqual({ dropdown: 'New Browser', custom: '' });
  });

  it('classifies _self, _parent, _top as Custom (Sitecore CE default Link Manager only exposes Active Browser, New Browser, Custom)', () => {
    expect(mapTargetAttributeToDropdown('_self')).toEqual({ dropdown: 'Custom', custom: '_self' });
    expect(mapTargetAttributeToDropdown('_parent')).toEqual({ dropdown: 'Custom', custom: '_parent' });
    expect(mapTargetAttributeToDropdown('_top')).toEqual({ dropdown: 'Custom', custom: '_top' });
  });

  it('classifies any other value as Custom and surfaces it in custom field', () => {
    expect(mapTargetAttributeToDropdown('my-frame-name')).toEqual({ dropdown: 'Custom', custom: 'my-frame-name' });
    expect(mapTargetAttributeToDropdown('something_weird')).toEqual({ dropdown: 'Custom', custom: 'something_weird' });
  });

  it('round-trips Custom values', () => {
    const { dropdown, custom } = mapTargetAttributeToDropdown('foo-frame');
    expect(mapTargetDropdownToAttribute(dropdown, custom)).toBe('foo-frame');
  });
});
