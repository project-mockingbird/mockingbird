import { describe, expect, it } from 'vitest';
import { buildEngine, seedRenderingPlaceholders } from '../layout/_helpers.js';
import { declaresDynamicPlaceholders } from '../../../src/engine/renderings/allowed-placeholders.js';

const R_DYNAMIC = 'aaaa0001-0000-0000-0000-000000000001';
const R_STATIC = 'aaaa0002-0000-0000-0000-000000000002';
const R_NONE = 'aaaa0003-0000-0000-0000-000000000003';

describe('declaresDynamicPlaceholders', () => {
  it('is true when a declared placeholder key contains a dynamic token', () => {
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, R_DYNAMIC, ['container-{*}']);
    expect(declaresDynamicPlaceholders(engine, R_DYNAMIC)).toBe(true);
  });

  it('is false when all declared keys are static', () => {
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, R_STATIC, ['header']);
    expect(declaresDynamicPlaceholders(engine, R_STATIC)).toBe(false);
  });

  it('is false when the rendering declares no placeholders', () => {
    const engine = buildEngine([]);
    expect(declaresDynamicPlaceholders(engine, R_NONE)).toBe(false);
  });
});
