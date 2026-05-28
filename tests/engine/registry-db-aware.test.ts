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
