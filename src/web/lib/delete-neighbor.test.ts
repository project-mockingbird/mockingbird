import { describe, it, expect } from 'vitest';
import { pickNeighborAfterDelete } from './delete-neighbor';

describe('pickNeighborAfterDelete', () => {
  const make = (...ids: string[]) => ids.map((id) => ({ id }));

  it('returns the previous sibling when one exists', () => {
    expect(pickNeighborAfterDelete(make('a', 'b', 'c'), 'b', 'p')).toBe('a');
    expect(pickNeighborAfterDelete(make('a', 'b', 'c'), 'c', 'p')).toBe('b');
  });

  it('falls back to the next sibling when deleting the first child', () => {
    expect(pickNeighborAfterDelete(make('a', 'b', 'c'), 'a', 'p')).toBe('b');
  });

  it('falls back to the parent when deleting the only child', () => {
    expect(pickNeighborAfterDelete(make('only'), 'only', 'p')).toBe('p');
  });

  it('returns null when deleting the only child and there is no parent', () => {
    expect(pickNeighborAfterDelete(make('only'), 'only', null)).toBeNull();
  });

  it('returns the parent when the deleted id is not in the siblings list', () => {
    expect(pickNeighborAfterDelete(make('a', 'b'), 'missing', 'p')).toBe('p');
  });

  it('returns null when siblings are empty and parent is null', () => {
    expect(pickNeighborAfterDelete([], 'x', null)).toBeNull();
  });
});
