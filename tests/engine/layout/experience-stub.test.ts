import { describe, it, expect } from 'vitest';
import { buildExperienceStub } from '../../../src/engine/layout/experience-stub.js';

describe('buildExperienceStub', () => {
  it('returns the uid-only experience-stub shape', () => {
    const stub = buildExperienceStub('c4a3bf11-0000-0000-0000-000000000001');
    expect(stub).toEqual({
      uid: 'c4a3bf11-0000-0000-0000-000000000001',
      componentName: null,
      dataSource: null,
      experiences: {},
    });
  });

  it('preserves uid exactly — does not re-case or re-normalize', () => {
    const stub = buildExperienceStub('ABCD1234-0000-0000-0000-000000000001');
    expect(stub.uid).toBe('ABCD1234-0000-0000-0000-000000000001');
  });
});
