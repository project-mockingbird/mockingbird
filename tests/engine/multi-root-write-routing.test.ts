import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { Engine } from '../../src/engine/index.js';
import { copySubtree } from '../../src/engine/copy-subtree.js';
import { copyItem } from '../../src/engine/copy-item.js';
import { duplicateItem } from '../../src/engine/duplicate-item.js';
import { insertItem } from '../../src/engine/insert-item.js';
import { TEMPLATE_TEMPLATE_ID } from '../../src/engine/constants.js';

/**
 * Regression net for the bug where new-item writes were misrouted to the
 * primary serialization root even when the destination parent lived in a
 * secondary content root. Root cause: `Engine.resolveFilePath` walked
 * `this.modules` in iteration order with primary modules first, so any
 * prefix-matching primary include won regardless of which root the parent
 * actually lived in. Fix: derive the new file path from the destination
 * parent's existing filePath stem, mirroring what moveItem and renameItem
 * already do.
 *
 * This fixture deliberately overlaps the primary's include path with the
 * content root's mount point so the bug reproduces:
 *
 *   primary include:  /sitecore/content/Site         (broader prefix)
 *   content include:  /sitecore/content/Site/Home    (narrower, actual data)
 *
 * Without the fix, any insert/copy/duplicate under Home routes through the
 * primary's broader include and lands in `<primary>/site/Home/...`.
 */
describe('Multi-root write routing', () => {
  let tempPrimary: string;
  let tempContent: string;
  let engine: Engine;

  const HOME_ID = 'cc000001-0000-0000-0000-000000000001';
  const ABOUT_ID = 'cc000001-0000-0000-0000-000000000002';
  const PAGE_TEMPLATE_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
  const NULL_GUID = '00000000-0000-0000-0000-000000000000';

  beforeEach(async () => {
    tempPrimary = await mkdtemp(resolve(tmpdir(), 'mb-primary-'));
    tempContent = await mkdtemp(resolve(tmpdir(), 'mb-content-'));

    await writeFile(join(tempPrimary, 'sitecore.json'), JSON.stringify({
      modules: ['*.module.json'],
    }), 'utf-8');
    await writeFile(join(tempPrimary, 'primary.module.json'), JSON.stringify({
      namespace: 'Primary',
      items: {
        includes: [
          { name: 'site', path: '/sitecore/content/Site' },
          { name: 'templates', path: '/sitecore/templates/Project' },
        ],
      },
    }), 'utf-8');
    await mkdir(join(tempPrimary, 'site'), { recursive: true });
    await mkdir(join(tempPrimary, 'templates'), { recursive: true });

    await writeFile(join(tempPrimary, 'templates', 'Page.yml'), `---
ID: "${PAGE_TEMPLATE_ID}"
Parent: "${NULL_GUID}"
Template: "${TEMPLATE_TEMPLATE_ID}"
Path: /sitecore/templates/Project/Page
SharedFields: []
Languages: []
`, 'utf-8');

    await writeFile(join(tempContent, 'sitecore.json'), JSON.stringify({
      modules: ['*.module.json'],
    }), 'utf-8');
    await writeFile(join(tempContent, 'content.module.json'), JSON.stringify({
      namespace: 'Content',
      items: {
        includes: [{ name: 'home', path: '/sitecore/content/Site/Home' }],
      },
    }), 'utf-8');
    await mkdir(join(tempContent, 'home', 'Home'), { recursive: true });

    await writeFile(join(tempContent, 'home', 'Home.yml'), `---
ID: "${HOME_ID}"
Parent: "${NULL_GUID}"
Template: "${PAGE_TEMPLATE_ID}"
Path: /sitecore/content/Site/Home
SharedFields: []
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields: []
`, 'utf-8');

    await writeFile(join(tempContent, 'home', 'Home', 'About.yml'), `---
ID: "${ABOUT_ID}"
Parent: "${HOME_ID}"
Template: "${PAGE_TEMPLATE_ID}"
Path: /sitecore/content/Site/Home/About
SharedFields: []
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields: []
`, 'utf-8');

    engine = new Engine({
      rootDir: tempPrimary,
      contentPaths: [tempContent],
    });
    await engine.init();
  });

  afterEach(async () => {
    await engine.close();
    await rm(tempPrimary, { recursive: true, force: true });
    await rm(tempContent, { recursive: true, force: true });
  });

  it('preconditions: Home is loaded with filePath in the content root', () => {
    const home = engine.getItemById(HOME_ID);
    expect(home).toBeDefined();
    expect(home!.filePath.startsWith(tempContent)).toBe(true);
    expect(home!.filePath.startsWith(tempPrimary)).toBe(false);
  });

  it('copySubtree under a content-root parent writes the new YAML into the content root', async () => {
    const result = await copySubtree(engine, {
      sourceId: ABOUT_ID,
      destinationParentId: HOME_ID,
      rootName: 'CopiedAbout',
      rewriteIntraSubtreeRefs: true,
    });
    const created = result.createdItems[0];
    expect(created.filePath.startsWith(tempContent)).toBe(true);
    expect(created.filePath.startsWith(tempPrimary)).toBe(false);
  });

  it('duplicateItem of a content-root item writes the duplicate next to it in the content root', async () => {
    const result = await duplicateItem(engine, {
      sourceId: ABOUT_ID,
      name: 'AboutDuplicate',
    });
    const created = result.createdItems[0];
    expect(created.filePath.startsWith(tempContent)).toBe(true);
    expect(created.filePath.startsWith(tempPrimary)).toBe(false);
  });

  it('copyItem of a content-root item to a content-root destination writes into the content root', async () => {
    const result = await copyItem(engine, {
      sourceId: ABOUT_ID,
      destinationParentId: HOME_ID,
      name: 'About Copy',
    });
    const created = result.createdItems[0];
    expect(created.filePath.startsWith(tempContent)).toBe(true);
    expect(created.filePath.startsWith(tempPrimary)).toBe(false);
  });

  it('insertItem under a content-root parent writes the new YAML into the content root', async () => {
    const result = await insertItem(engine, {
      parentId: HOME_ID,
      templateId: PAGE_TEMPLATE_ID,
      name: 'NewChild',
    });
    const created = result.createdItems[0];
    expect(created.filePath.startsWith(tempContent)).toBe(true);
    expect(created.filePath.startsWith(tempPrimary)).toBe(false);
  });

  it('produces sibling-style on-disk layout (parent.yml + parent/child.yml), not deep-nested', async () => {
    const result = await insertItem(engine, {
      parentId: HOME_ID,
      templateId: PAGE_TEMPLATE_ID,
      name: 'Sibling',
    });
    const created = result.createdItems[0];
    expect(created.filePath).toBe(join(tempContent, 'home', 'Home', 'Sibling.yml'));
  });
});
