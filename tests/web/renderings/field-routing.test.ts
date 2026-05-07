import { describe, expect, it } from 'vitest';
import { routeFieldToBinding, type FieldBinding, isSystemField } from '../../../src/web/components/detail/field-editors/renderings/field-routing';

describe('routeFieldToBinding', () => {
  const cases: Array<[string, FieldBinding]> = [
    ['Placeholder', 'placeholder'],
    ['placeholder', 'placeholder'],
    ['PLACEHOLDER', 'placeholder'],
    ['Data Source', 'datasource'],
    ['data source', 'datasource'],
    ['Caching', 'caching'],
    ['CacheClearingBehavior', 'cacheclearingbehavior'],
    ['cacheclearingbehavior', 'cacheclearingbehavior'],
    ['Personalization', 'personalization'],
    ['Additional Parameters', 'additional'],
    ['Content Dependencies', 'contentdeps'],
    ['Tests', 'tests'],
    ['FieldNames', 'variant'],
    ['fieldnames', 'variant'],
    ['Styles', 'styles'],
    ['styles', 'styles'],
    ['GridParameters', 'gridparameters'],
    ['gridparameters', 'gridparameters'],
    ['SomeCustomField', 'custom'],
    ['', 'custom'],
    ['DataSource', 'custom'],  // no space - not the reserved name
  ];

  for (const [name, expected] of cases) {
    it(`maps "${name}" to "${expected}"`, () => {
      expect(routeFieldToBinding(name)).toBe(expected);
    });
  }
});


describe('isSystemField', () => {
  const trueCases = [
    '__Source',
    '__OnSave',
    '__Renderings',
    '__Display Name',
    'RenderingIdentifier',
    'renderingidentifier',
    'CSSStyles',
    'cssstyles',
    'DynamicPlaceholderId',
    'dynamicplaceholderid',
  ];
  for (const name of trueCases) {
    it(`returns true for system field "${name}"`, () => {
      expect(isSystemField(name)).toBe(true);
    });
  }

  const falseCases = [
    'Placeholder',
    'Data Source',
    'Caching',
    'Personalization',
    'Styles',
    'GridParameters',
    'FieldNames',
    'Variant',           // user-defined field happening to be named Variant
    'CustomField',
    'Title',
    '',
    '_NotDoubleUnderscored',  // single underscore is not __
  ];
  for (const name of falseCases) {
    it(`returns false for non-system field "${name}"`, () => {
      expect(isSystemField(name)).toBe(false);
    });
  }
});

import { computeCoveredFieldNames } from '../../../src/web/components/detail/field-editors/renderings/field-routing';

describe('computeCoveredFieldNames', () => {
  it('includes schema field names case-folded', () => {
    const result = computeCoveredFieldNames(['Variant', 'Color'], {});
    expect(result.sort()).toEqual(['color', 'variant']);
  });

  it('adds reserved-name keys present in entry.params even when schema is empty', () => {
    const result = computeCoveredFieldNames([], { FieldNames: '{x}', Styles: '{y}', GridParameters: '{z}' });
    expect(result.sort()).toEqual(['fieldnames', 'gridparameters', 'styles']);
  });

  it('does not add custom param names that are not reserved', () => {
    const result = computeCoveredFieldNames([], { CustomThing: 'x', AnotherOne: 'y' });
    expect(result).toEqual([]);
  });

  it('unions schema names + reserved-name params without duplicates', () => {
    const result = computeCoveredFieldNames(['FieldNames', 'CustomA'], { FieldNames: '{x}', Styles: '{y}' });
    expect(result.sort()).toEqual(['customa', 'fieldnames', 'styles']);
  });

  it('does not add reserved-name keys whose value is empty string', () => {
    // Conservative: empty value means "no SXA control needed". Avoids surfacing
    // an empty Variant control when the param is `FieldNames=` (placeholder).
    const result = computeCoveredFieldNames([], { FieldNames: '', Styles: '{y}' });
    expect(result.sort()).toEqual(['styles']);
  });
});
