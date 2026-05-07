import { describe, expect, it } from 'vitest';
import { resolveGridOptions, composeBootstrapClass } from '../../../src/engine/sxa/grid-options.js';
import { buildEngine, makeItem } from '../layout/_helpers.js';

const CLASS_FIELD_ID = '591c584f-08a7-4dc6-9d58-1de178c404a2';
const GRID_ROOT_PATH = '/sitecore/system/Settings/Feature/Experience Accelerator/Bootstrap 5/Bootstrap 5 Grid Definition';

describe('composeBootstrapClass', () => {
  const cases: Array<[string, string, string, string]> = [
    ['Extra small', 'Size', '12', 'col-12'],
    ['Small', 'Size', '6', 'col-sm-6'],
    ['Medium', 'Size', '6', 'col-md-6'],
    ['Large', 'Size', '2', 'col-lg-2'],
    ['Extra large', 'Size', '4', 'col-xl-4'],
    ['Extra extra large', 'Size', '3', 'col-xxl-3'],
    ['Extra small', 'Offset', '2', 'offset-2'],
    ['Large', 'Offset', '0', 'offset-lg-0'],
    ['Extra small', 'Order', '1', 'order-1'],
    ['Small', 'Display', 'block', 'd-sm-block'],
    ['Extra small', 'Display', 'none', 'd-none'],
    ['Large', 'Component alignment', 'center', 'align-lg-center'],
    ['Extra small', 'Component alignment', 'center', 'align-center'],
  ];
  for (const [bp, kind, value, expected] of cases) {
    it(`composes ${bp} / ${kind} / ${value} -> ${expected}`, () => {
      expect(composeBootstrapClass(bp, kind, value)).toBe(expected);
    });
  }
});

describe('resolveGridOptions', () => {
  function buildFx() {
    return [
      makeItem({ id: 'sitecore-root', path: '/sitecore' }),
      makeItem({ id: 'sys', parent: 'sitecore-root', path: '/sitecore/system' }),
      makeItem({ id: 'settings', parent: 'sys', path: '/sitecore/system/Settings' }),
      makeItem({ id: 'feature', parent: 'settings', path: '/sitecore/system/Settings/Feature' }),
      makeItem({ id: 'sxa', parent: 'feature', path: '/sitecore/system/Settings/Feature/Experience Accelerator' }),
      makeItem({ id: 'b5', parent: 'sxa', path: '/sitecore/system/Settings/Feature/Experience Accelerator/Bootstrap 5' }),
      makeItem({ id: 'gridroot', parent: 'b5', path: GRID_ROOT_PATH }),
      makeItem({ id: 'bp-xs', parent: 'gridroot', path: `${GRID_ROOT_PATH}/Extra small` }),
      makeItem({ id: 'xs-size', parent: 'bp-xs', path: `${GRID_ROOT_PATH}/Extra small/Size` }),
      makeItem({ id: 'xs-size-12', parent: 'xs-size', path: `${GRID_ROOT_PATH}/Extra small/Size/12` }),
      makeItem({ id: 'bp-lg', parent: 'gridroot', path: `${GRID_ROOT_PATH}/Large` }),
      makeItem({ id: 'lg-size', parent: 'bp-lg', path: `${GRID_ROOT_PATH}/Large/Size` }),
      makeItem({ id: 'lg-size-6', parent: 'lg-size', path: `${GRID_ROOT_PATH}/Large/Size/6` }),
      makeItem({ id: 'lg-offset', parent: 'bp-lg', path: `${GRID_ROOT_PATH}/Large/Offset` }),
      makeItem({ id: 'lg-offset-2', parent: 'lg-offset', path: `${GRID_ROOT_PATH}/Large/Offset/2` }),
    ];
  }

  it('returns matrix structure with breakpoints, dimensions, and cells', () => {
    const engine = buildEngine(buildFx());
    const result = resolveGridOptions(engine, '');
    expect(result.breakpoints.map(b => b.displayName).sort()).toEqual(['Extra small', 'Large']);
    expect(result.dimensions.map(d => d.displayName).sort()).toEqual(['Offset', 'Size']);
    const xsSizeCell = result.cells.find(c => c.breakpointKey === 'extra-small' && c.dimensionKey === 'size');
    expect(xsSizeCell?.options).toEqual([
      expect.objectContaining({ displayName: '12', cssClass: 'col-12' }),
    ]);
    const lgOffsetCell = result.cells.find(c => c.breakpointKey === 'large' && c.dimensionKey === 'offset');
    expect(lgOffsetCell?.options).toEqual([
      expect.objectContaining({ displayName: '2', cssClass: 'offset-lg-2' }),
    ]);
  });

  it('returns empty when GridSetup root not found', () => {
    const engine = buildEngine([
      makeItem({ id: 'site', path: '/sitecore/content/tenant/site' }),
    ]);
    const result = resolveGridOptions(engine, '');
    expect(result.breakpoints).toEqual([]);
    expect(result.cells).toEqual([]);
  });

  it('marks Size as basic tab and others as advanced', () => {
    const engine = buildEngine(buildFx());
    const result = resolveGridOptions(engine, '');
    expect(result.dimensions.find(d => d.displayName === 'Size')?.tab).toBe('basic');
    expect(result.dimensions.find(d => d.displayName === 'Offset')?.tab).toBe('advanced');
  });

  it('orders value items numerically when names parse as numbers (1, 2, 10 not 1, 10, 2)', () => {
    // Build a minimal Size column with values 1, 10, 2, 12 in scrambled tree-add order.
    const fx = [
      makeItem({ id: 'sitecore-root', path: '/sitecore' }),
      makeItem({ id: 'sys', parent: 'sitecore-root', path: '/sitecore/system' }),
      makeItem({ id: 'settings', parent: 'sys', path: '/sitecore/system/Settings' }),
      makeItem({ id: 'feature', parent: 'settings', path: '/sitecore/system/Settings/Feature' }),
      makeItem({ id: 'sxa', parent: 'feature', path: '/sitecore/system/Settings/Feature/Experience Accelerator' }),
      makeItem({ id: 'b5', parent: 'sxa', path: '/sitecore/system/Settings/Feature/Experience Accelerator/Bootstrap 5' }),
      makeItem({ id: 'gridroot', parent: 'b5', path: GRID_ROOT_PATH }),
      makeItem({ id: 'bp-xs', parent: 'gridroot', path: `${GRID_ROOT_PATH}/Extra small` }),
      makeItem({ id: 'xs-size', parent: 'bp-xs', path: `${GRID_ROOT_PATH}/Extra small/Size` }),
      // Add in lex-bad order: 10 before 2 to verify lex sort would fail.
      makeItem({ id: 'xs-size-1', parent: 'xs-size', path: `${GRID_ROOT_PATH}/Extra small/Size/1` }),
      makeItem({ id: 'xs-size-10', parent: 'xs-size', path: `${GRID_ROOT_PATH}/Extra small/Size/10` }),
      makeItem({ id: 'xs-size-2', parent: 'xs-size', path: `${GRID_ROOT_PATH}/Extra small/Size/2` }),
      makeItem({ id: 'xs-size-12', parent: 'xs-size', path: `${GRID_ROOT_PATH}/Extra small/Size/12` }),
    ];
    const engine = buildEngine(fx);
    const result = resolveGridOptions(engine, '');
    const cell = result.cells.find(c => c.breakpointKey === 'extra-small' && c.dimensionKey === 'size');
    expect(cell?.options.map(o => o.displayName)).toEqual(['1', '2', '10', '12']);
  });

  it('reads Class field from value items when present', () => {
    const fx = buildFx();
    // Add Class field to the xs-size-12 item.
    const xs12 = fx.find(i => i.id === 'xs-size-12')!;
    xs12.sharedFields = [
      ...xs12.sharedFields,
      { id: CLASS_FIELD_ID, hint: 'Class', value: 'col-custom-12' },
    ];
    const engine = buildEngine(fx);
    const result = resolveGridOptions(engine, '');
    const cell = result.cells.find(c => c.breakpointKey === 'extra-small' && c.dimensionKey === 'size');
    expect(cell?.options[0].cssClass).toBe('col-custom-12');
  });

  it('falls back to composeBootstrapClass when Class field is absent', () => {
    const engine = buildEngine(buildFx());
    const result = resolveGridOptions(engine, '');
    const cell = result.cells.find(c => c.breakpointKey === 'extra-small' && c.dimensionKey === 'size');
    expect(cell?.options[0].cssClass).toBe('col-12');
  });
});
