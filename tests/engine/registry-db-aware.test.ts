import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registry } from '../../src/engine/registry.js';

// Twin fixture: bad98e0e is /sitecore/masters in core but /sitecore/templates/Branches in master.
const ROOT = '11111111-1111-1111-1111-111111111111';
const TEMPLATES = '3c1715fe-6a13-4fcf-845f-de308ba9741d';
const BRANCHES = 'bad98e0e-c1b5-4598-ac13-21b06218b30c';
const DEVICE = 'aaaa1111-0000-0000-0000-000000000001';
const FEATURE = 'bbbb2222-0000-0000-0000-000000000002';
const TPL = 'cccc3333-0000-0000-0000-000000000003';

const DATA = {
  version: 'test', source: 'test', extractedAt: '2026-05-28T00:00:00Z',
  items: [
    // core spine + legacy masters
    { id: ROOT, name: 'sitecore', parent: '00000000-0000-0000-0000-000000000000', template: TPL, path: '/sitecore', database: 'core', sharedFields: {} },
    { id: BRANCHES, name: 'masters', parent: ROOT, template: TPL, path: '/sitecore/masters', database: 'core', sharedFields: {} },
    { id: DEVICE, name: 'Device', parent: BRANCHES, template: TPL, path: '/sitecore/masters/Device', database: 'core', sharedFields: {} },
    // master spine + branches
    { id: ROOT, name: 'sitecore', parent: '00000000-0000-0000-0000-000000000000', template: TPL, path: '/sitecore', database: 'master', sharedFields: {} },
    { id: TEMPLATES, name: 'templates', parent: ROOT, template: TPL, path: '/sitecore/templates', database: 'master', sharedFields: {} },
    { id: BRANCHES, name: 'Branches', parent: TEMPLATES, template: TPL, path: '/sitecore/templates/Branches', database: 'master', sharedFields: {} },
    { id: FEATURE, name: 'Feature', parent: BRANCHES, template: TPL, path: '/sitecore/templates/Branches/Feature', database: 'master', sharedFields: {} },
  ],
};

describe('db-aware registry', () => {
  let dir: string;
  let reg: Registry;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'reg-'));
    writeFileSync(join(dir, 'r.json'), JSON.stringify(DATA));
    reg = new Registry();
    await reg.loadFromJson(join(dir, 'r.json'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps both twins (size counts all items)', () => {
    expect(reg.size).toBe(7);
    expect(reg.sizeByDatabase('core')).toBe(3);
    expect(reg.sizeByDatabase('master')).toBe(4);
  });

  it('getChildren(Branches, master) returns only master children - no core leak', () => {
    const names = reg.getChildren(BRANCHES, 'master').map(c => c.name).sort();
    expect(names).toEqual(['Feature']);
  });

  it('getChildren(Branches, core) returns only core children', () => {
    const names = reg.getChildren(BRANCHES, 'core').map(c => c.name).sort();
    expect(names).toEqual(['Device']);
  });

  it('getByPath resolves the correct twin per db', () => {
    expect(reg.getByPath('/sitecore/templates/branches', 'master')?.database).toBe('master');
    expect(reg.getByPath('/sitecore/masters', 'core')?.database).toBe('core');
  });

  it('getById(no db) is master-preferred; getById(db) is exact', () => {
    expect(reg.getById(BRANCHES)?.path).toBe('/sitecore/templates/Branches'); // master preferred
    expect(reg.getById(BRANCHES, 'core')?.path).toBe('/sitecore/masters');
  });

  it('getChildren(no db) concatenates across dbs (back-compat)', () => {
    const names = reg.getChildren(BRANCHES).map(c => c.name).sort();
    expect(names).toEqual(['Device', 'Feature']);
  });

  it('getItemsByTemplate de-dupes colliding GUIDs (master-preferred)', () => {
    const byTpl = reg.getItemsByTemplate(TPL);
    const branchHits = byTpl.filter(i => i.id === BRANCHES);
    expect(branchHits).toHaveLength(1);
    expect(branchHits[0].database).toBe('master');
  });
});

// True cross-db twins: the SAME child id under the SAME parent in both core and
// master (how OOTB system templates ship - e.g. the Schedule template's "Data"
// section and its fields exist identically in both dbs). db-agnostic getChildren
// must return each child ONCE (master-preferred). Regression guard for the
// Content Editor "Data" section rendering Command/Items/Schedule/... twice.
describe('db-agnostic getChildren de-dupes true cross-db twins', () => {
  const SECTION = 'dddd4444-0000-0000-0000-000000000004';
  const F_COMMAND = 'eeee5555-0000-0000-0000-000000000005';
  const F_ITEMS = 'ffff6666-0000-0000-0000-000000000006';
  const TWIN_DATA = {
    version: 'test', source: 'test', extractedAt: '2026-05-28T00:00:00Z',
    items: [
      // identical section + fields in BOTH dbs (same ids = true twins)
      { id: SECTION, name: 'Data', parent: '00000000-0000-0000-0000-000000000000', template: TPL, path: '/data', database: 'core', sharedFields: {} },
      { id: F_COMMAND, name: 'Command', parent: SECTION, template: TPL, path: '/data/Command', database: 'core', sharedFields: {} },
      { id: F_ITEMS, name: 'Items', parent: SECTION, template: TPL, path: '/data/Items', database: 'core', sharedFields: {} },
      { id: SECTION, name: 'Data', parent: '00000000-0000-0000-0000-000000000000', template: TPL, path: '/data', database: 'master', sharedFields: {} },
      { id: F_COMMAND, name: 'Command', parent: SECTION, template: TPL, path: '/data/Command', database: 'master', sharedFields: {} },
      { id: F_ITEMS, name: 'Items', parent: SECTION, template: TPL, path: '/data/Items', database: 'master', sharedFields: {} },
    ],
  };
  let dir: string;
  let reg: Registry;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'reg-twin-'));
    writeFileSync(join(dir, 'r.json'), JSON.stringify(TWIN_DATA));
    reg = new Registry();
    await reg.loadFromJson(join(dir, 'r.json'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns each twin child once (no db), master-preferred', () => {
    const kids = reg.getChildren(SECTION);
    expect(kids).toHaveLength(2);
    expect(kids.map(c => c.name).sort()).toEqual(['Command', 'Items']);
    expect(kids.every(c => c.database === 'master')).toBe(true);
  });
});
