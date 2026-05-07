import { describe, it, expect } from 'vitest';
import { buildEngine, makeItem } from './_helpers.js';
import {
  walkBaseTemplates,
  templateInheritsFrom,
  templateDescendsFromOrEquals,
  getDirectBaseTemplateIds,
} from '../../../src/engine/layout/template-walk.js';
import { FIELD_IDS, TEMPLATE_TEMPLATE_ID } from '../../../src/engine/constants.js';

// Build a minimal template: id, with given direct base-template IDs.
function tpl(id: string, bases: string[] = []): ReturnType<typeof makeItem> {
  const sharedFields = bases.length > 0
    ? [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: bases.map(b => `{${b.toUpperCase()}}`).join('|') }]
    : [];
  return makeItem({
    id,
    path: `/sitecore/templates/test/${id}`,
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields,
  });
}

describe('walkBaseTemplates', () => {
  it('visits the start template itself first', () => {
    const engine = buildEngine([tpl('aaaa0001-0000-0000-0000-000000000000')]);
    const visited: string[] = [];
    walkBaseTemplates(engine, 'aaaa0001-0000-0000-0000-000000000000', (id) => {
      visited.push(id);
    });
    expect(visited).toEqual(['aaaa0001-0000-0000-0000-000000000000']);
  });

  it('walks transitive base templates BFS', () => {
    const engine = buildEngine([
      tpl('aaaa0001-0000-0000-0000-000000000000', ['aaaa0002-0000-0000-0000-000000000000']),
      tpl('aaaa0002-0000-0000-0000-000000000000', ['aaaa0003-0000-0000-0000-000000000000']),
      tpl('aaaa0003-0000-0000-0000-000000000000'),
    ]);
    const visited: string[] = [];
    walkBaseTemplates(engine, 'aaaa0001-0000-0000-0000-000000000000', (id) => {
      visited.push(id);
    });
    expect(visited).toEqual([
      'aaaa0001-0000-0000-0000-000000000000',
      'aaaa0002-0000-0000-0000-000000000000',
      'aaaa0003-0000-0000-0000-000000000000',
    ]);
  });

  it('terminates when visitor returns true', () => {
    const engine = buildEngine([
      tpl('aaaa0001-0000-0000-0000-000000000000', ['aaaa0002-0000-0000-0000-000000000000']),
      tpl('aaaa0002-0000-0000-0000-000000000000'),
    ]);
    const visited: string[] = [];
    walkBaseTemplates(engine, 'aaaa0001-0000-0000-0000-000000000000', (id) => {
      visited.push(id);
      return id === 'aaaa0001-0000-0000-0000-000000000000';
    });
    expect(visited).toEqual(['aaaa0001-0000-0000-0000-000000000000']);
  });

  it('is cycle-safe', () => {
    const engine = buildEngine([
      tpl('aaaa0001-0000-0000-0000-000000000000', ['aaaa0002-0000-0000-0000-000000000000']),
      tpl('aaaa0002-0000-0000-0000-000000000000', ['aaaa0001-0000-0000-0000-000000000000']),
    ]);
    const visited: string[] = [];
    walkBaseTemplates(engine, 'aaaa0001-0000-0000-0000-000000000000', (id) => {
      visited.push(id);
    });
    expect(visited).toEqual([
      'aaaa0001-0000-0000-0000-000000000000',
      'aaaa0002-0000-0000-0000-000000000000',
    ]);
  });
});

describe('templateInheritsFrom (strict, excludes identity)', () => {
  it('returns true when template has ancestor in its chain', () => {
    const engine = buildEngine([
      tpl('aaaa0001-0000-0000-0000-000000000000', ['aaaa0002-0000-0000-0000-000000000000']),
      tpl('aaaa0002-0000-0000-0000-000000000000'),
    ]);
    expect(templateInheritsFrom(engine, 'aaaa0001-0000-0000-0000-000000000000', 'aaaa0002-0000-0000-0000-000000000000')).toBe(true);
  });

  it('returns false for identity (strict)', () => {
    const engine = buildEngine([tpl('aaaa0001-0000-0000-0000-000000000000')]);
    expect(templateInheritsFrom(engine, 'aaaa0001-0000-0000-0000-000000000000', 'aaaa0001-0000-0000-0000-000000000000')).toBe(false);
  });

  it('returns false when ancestor is not in chain', () => {
    const engine = buildEngine([tpl('aaaa0001-0000-0000-0000-000000000000')]);
    expect(templateInheritsFrom(engine, 'aaaa0001-0000-0000-0000-000000000000', 'ffff0000-0000-0000-0000-000000000000')).toBe(false);
  });
});

describe('templateDescendsFromOrEquals (includes identity)', () => {
  it('returns true for identity', () => {
    const engine = buildEngine([tpl('aaaa0001-0000-0000-0000-000000000000')]);
    expect(templateDescendsFromOrEquals(engine, 'aaaa0001-0000-0000-0000-000000000000', 'aaaa0001-0000-0000-0000-000000000000')).toBe(true);
  });

  it('returns true for transitive descendant', () => {
    const engine = buildEngine([
      tpl('aaaa0001-0000-0000-0000-000000000000', ['aaaa0002-0000-0000-0000-000000000000']),
      tpl('aaaa0002-0000-0000-0000-000000000000'),
    ]);
    expect(templateDescendsFromOrEquals(engine, 'aaaa0001-0000-0000-0000-000000000000', 'aaaa0002-0000-0000-0000-000000000000')).toBe(true);
  });
});

describe('getDirectBaseTemplateIds (preserves declaration order)', () => {
  it('returns the direct base template IDs in order', () => {
    const engine = buildEngine([
      tpl('aaaa0001-0000-0000-0000-000000000000', [
        'aaaa0002-0000-0000-0000-000000000000',
        'aaaa0003-0000-0000-0000-000000000000',
      ]),
    ]);
    expect(getDirectBaseTemplateIds(engine, 'aaaa0001-0000-0000-0000-000000000000')).toEqual([
      'aaaa0002-0000-0000-0000-000000000000',
      'aaaa0003-0000-0000-0000-000000000000',
    ]);
  });

  it('returns empty array when no base templates', () => {
    const engine = buildEngine([tpl('aaaa0001-0000-0000-0000-000000000000')]);
    expect(getDirectBaseTemplateIds(engine, 'aaaa0001-0000-0000-0000-000000000000')).toEqual([]);
  });

  it('returns empty array for unknown template', () => {
    const engine = buildEngine([]);
    expect(getDirectBaseTemplateIds(engine, 'aaaa0001-0000-0000-0000-000000000000')).toEqual([]);
  });
});
