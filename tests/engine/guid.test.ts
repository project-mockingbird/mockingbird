import { describe, it, expect } from 'vitest';
import { generateGuid } from '../../src/engine/guid.js';

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('generateGuid', () => {
  it('generates a valid lowercase GUID', () => {
    const guid = generateGuid();
    expect(guid).toMatch(GUID_REGEX);
  });

  it('generates unique GUIDs on each call', () => {
    const a = generateGuid();
    const b = generateGuid();
    expect(a).not.toBe(b);
  });
});
