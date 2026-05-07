// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNameValidation } from '../../../src/web/hooks/useNameValidation';

describe('useNameValidation', () => {
  it('returns null for a valid name with no siblings', () => {
    const { result } = renderHook(() => useNameValidation('NewItem', []));
    expect(result.current).toBeNull();
  });

  it('returns the format error for an invalid name', () => {
    const { result } = renderHook(() => useNameValidation('Bad/Name', []));
    expect(result.current).toMatch(/invalid characters/i);
  });

  it('returns the collision error when name matches a sibling (case-insensitive)', () => {
    const { result } = renderHook(() => useNameValidation('Existing', ['existing', 'Other']));
    expect(result.current).toMatch(/already exists/i);
  });

  it('siblings parameter optional - skips uniqueness check when undefined', () => {
    const { result } = renderHook(() => useNameValidation('Anything', undefined));
    expect(result.current).toBeNull();
  });

  it('updates as the name changes', () => {
    const { result, rerender } = renderHook(
      ({ name }) => useNameValidation(name, ['Foo']),
      { initialProps: { name: 'Foo' } },
    );
    expect(result.current).toMatch(/already exists/i);
    rerender({ name: 'Bar' });
    expect(result.current).toBeNull();
  });
});
