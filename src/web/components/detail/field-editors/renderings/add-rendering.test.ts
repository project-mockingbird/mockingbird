import { describe, it, expect } from 'vitest';
import { nextDynamicPlaceholderId, buildAddedRenderingEntry } from './add-rendering';
import type { RenderingEntry } from './types';

const entry = (params: Record<string, string>): RenderingEntry => ({
  uid: '{U}',
  renderingId: '{R}',
  placeholder: '/x',
  dataSource: '',
  params,
});

describe('nextDynamicPlaceholderId', () => {
  it('returns 1 when there are no entries', () => {
    expect(nextDynamicPlaceholderId([])).toBe(1);
  });

  it('returns the max existing DynamicPlaceholderId + 1', () => {
    expect(
      nextDynamicPlaceholderId([
        entry({ DynamicPlaceholderId: '1' }),
        entry({ DynamicPlaceholderId: '3' }),
        entry({}),
      ]),
    ).toBe(4);
  });

  it('ignores non-numeric DynamicPlaceholderId values', () => {
    expect(
      nextDynamicPlaceholderId([
        entry({ DynamicPlaceholderId: 'abc' }),
        entry({ DynamicPlaceholderId: '2' }),
      ]),
    ).toBe(3);
  });
});

describe('buildAddedRenderingEntry', () => {
  it('assigns DynamicPlaceholderId when the rendering declares dynamic placeholders', () => {
    const e = buildAddedRenderingEntry({
      uid: '{U}',
      renderingId: '{R}',
      placeholder: '/headless-main',
      dataSource: '',
      declaresDynamicPlaceholders: true,
      nextDynamicPlaceholderId: 2,
    });
    expect(e.params.DynamicPlaceholderId).toBe('2');
  });

  it('does not assign a DynamicPlaceholderId for a non-dynamic rendering', () => {
    const e = buildAddedRenderingEntry({
      uid: '{U}',
      renderingId: '{R}',
      placeholder: '/headless-main',
      dataSource: '',
      declaresDynamicPlaceholders: false,
      nextDynamicPlaceholderId: 2,
    });
    expect(e.params).toEqual({});
  });

  it('carries uid/renderingId/placeholder/dataSource through verbatim', () => {
    const e = buildAddedRenderingEntry({
      uid: '{U1}',
      renderingId: '{R1}',
      placeholder: '/p',
      dataSource: 'local:Data/X',
      declaresDynamicPlaceholders: false,
      nextDynamicPlaceholderId: 1,
    });
    expect(e).toMatchObject({ uid: '{U1}', renderingId: '{R1}', placeholder: '/p', dataSource: 'local:Data/X' });
  });
});
