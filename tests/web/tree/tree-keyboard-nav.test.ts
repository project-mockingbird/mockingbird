import { describe, expect, it } from 'vitest';
import { computeIntent, isFocusInDOM, type RowMeta } from '../../../src/web/components/tree/tree-keyboard-nav';

const flatRows: RowMeta[] = [
  { id: 'a', level: 0, isParent: false, isExpanded: false },
  { id: 'b', level: 0, isParent: false, isExpanded: false },
  { id: 'c', level: 0, isParent: false, isExpanded: false },
];

describe('computeIntent - ArrowDown', () => {
  it('returns focus to next row when not at end', () => {
    expect(computeIntent(flatRows, 'a', 'ArrowDown')).toEqual({
      kind: 'focus',
      targetId: 'b',
    });
  });
});

describe('computeIntent - ArrowDown bound', () => {
  it('returns noop at last row (no wraparound)', () => {
    expect(computeIntent(flatRows, 'c', 'ArrowDown')).toEqual({ kind: 'noop' });
  });
});

describe('computeIntent - ArrowUp', () => {
  it('returns focus to previous row when not at start', () => {
    expect(computeIntent(flatRows, 'b', 'ArrowUp')).toEqual({
      kind: 'focus',
      targetId: 'a',
    });
  });
  it('returns noop at first row (no wraparound)', () => {
    expect(computeIntent(flatRows, 'a', 'ArrowUp')).toEqual({ kind: 'noop' });
  });
});

describe('computeIntent - Home / End', () => {
  it('Home jumps to first visible row', () => {
    expect(computeIntent(flatRows, 'b', 'Home')).toEqual({
      kind: 'focus',
      targetId: 'a',
    });
  });
  it('End jumps to last visible row', () => {
    expect(computeIntent(flatRows, 'b', 'End')).toEqual({
      kind: 'focus',
      targetId: 'c',
    });
  });
});

const nestedRows: RowMeta[] = [
  { id: 'p1', level: 0, isParent: true, isExpanded: true },
  { id: 'p1c1', level: 1, isParent: false, isExpanded: false },
  { id: 'p1c2', level: 1, isParent: false, isExpanded: false },
  { id: 'p2', level: 0, isParent: true, isExpanded: false },
  { id: 'leaf', level: 0, isParent: false, isExpanded: false },
];

describe('computeIntent - ArrowRight', () => {
  it('on collapsed parent returns expand intent', () => {
    expect(computeIntent(nestedRows, 'p2', 'ArrowRight')).toEqual({
      kind: 'expand',
      id: 'p2',
    });
  });
  it('on expanded parent moves focus to first child', () => {
    expect(computeIntent(nestedRows, 'p1', 'ArrowRight')).toEqual({
      kind: 'focus',
      targetId: 'p1c1',
    });
  });
  it('on leaf returns noop', () => {
    expect(computeIntent(nestedRows, 'leaf', 'ArrowRight')).toEqual({ kind: 'noop' });
  });
});

describe('computeIntent - ArrowLeft', () => {
  it('on expanded parent returns collapse intent', () => {
    expect(computeIntent(nestedRows, 'p1', 'ArrowLeft')).toEqual({
      kind: 'collapse',
      id: 'p1',
    });
  });
  it('on collapsed parent moves focus to parent', () => {
    // p2 is a level-0 parent; ArrowLeft on a level-0 collapsed parent has
    // no parent to move to and is a noop.
    expect(computeIntent(nestedRows, 'p2', 'ArrowLeft')).toEqual({ kind: 'noop' });
  });
  it('on child leaf moves focus to parent', () => {
    expect(computeIntent(nestedRows, 'p1c2', 'ArrowLeft')).toEqual({
      kind: 'focus',
      targetId: 'p1',
    });
  });
  it('on root-level leaf returns noop', () => {
    expect(computeIntent(nestedRows, 'leaf', 'ArrowLeft')).toEqual({ kind: 'noop' });
  });
});

describe('computeIntent - activation', () => {
  it('Enter returns activate intent on the current row', () => {
    expect(computeIntent(flatRows, 'b', 'Enter')).toEqual({
      kind: 'activate',
      id: 'b',
    });
  });
  it('Space (key " ") returns activate intent on the current row', () => {
    expect(computeIntent(flatRows, 'b', ' ')).toEqual({
      kind: 'activate',
      id: 'b',
    });
  });
  it('Enter with no current row returns noop', () => {
    expect(computeIntent(flatRows, null, 'Enter')).toEqual({ kind: 'noop' });
  });
});

describe('computeIntent - null current + movement', () => {
  it('ArrowDown with null current focuses first row', () => {
    expect(computeIntent(flatRows, null, 'ArrowDown')).toEqual({
      kind: 'focus',
      targetId: 'a',
    });
  });
  it('ArrowUp with null current focuses first row', () => {
    expect(computeIntent(flatRows, null, 'ArrowUp')).toEqual({
      kind: 'focus',
      targetId: 'a',
    });
  });
  it('Home with null current focuses first row', () => {
    expect(computeIntent(flatRows, null, 'Home')).toEqual({
      kind: 'focus',
      targetId: 'a',
    });
  });
  it('End with null current focuses last row', () => {
    expect(computeIntent(flatRows, null, 'End')).toEqual({
      kind: 'focus',
      targetId: 'c',
    });
  });
});

describe('computeIntent - empty rows / unknown key', () => {
  it('any key against empty rows returns noop', () => {
    expect(computeIntent([], null, 'ArrowDown')).toEqual({ kind: 'noop' });
    expect(computeIntent([], 'x', 'Enter')).toEqual({ kind: 'noop' });
  });
  it('unknown key returns noop', () => {
    expect(computeIntent(flatRows, 'a', 'a')).toEqual({ kind: 'noop' });
    expect(computeIntent(flatRows, 'a', 'Tab')).toEqual({ kind: 'noop' });
  });
});

describe('isFocusInDOM', () => {
  it('returns true when focusedId is in rows', () => {
    expect(isFocusInDOM(flatRows, 'b')).toBe(true);
  });
  it('returns false when focusedId is not in rows', () => {
    expect(isFocusInDOM(flatRows, 'gone')).toBe(false);
  });
  it('returns false when focusedId is null', () => {
    expect(isFocusInDOM(flatRows, null)).toBe(false);
  });
});
