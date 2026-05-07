import { describe, it, expect, vi } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, mkdir, rm, mkdtemp } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
const CONTENT_ROOT = resolve(__dirname, '../fixtures/content-root');

describe('Engine with contentPaths', () => {
  it('loads items from content path into the same tree', async () => {
    const engine = new Engine({
      rootDir: FIXTURES,
      contentPaths: [CONTENT_ROOT],
    });
    await engine.init();

    // Primary root has 10 items, content root adds 2
    expect(engine.getAllItems()).toHaveLength(12);

    const home = engine.getItemByPath('/sitecore/content/Site/Home');
    expect(home).toBeDefined();
    expect(home!.item.id).toBe('cc000001-0000-0000-0000-000000000001');

    const about = engine.getItemByPath('/sitecore/content/Site/Home/About');
    expect(about).toBeDefined();
    expect(about!.item.id).toBe('cc000001-0000-0000-0000-000000000002');

    await engine.close();
  });

  it('silently skips a nonexistent content path', async () => {
    const engine = new Engine({
      rootDir: FIXTURES,
      contentPaths: [resolve(__dirname, '../fixtures/does-not-exist')],
    });
    await engine.init();

    // Only primary root items loaded
    expect(engine.getAllItems()).toHaveLength(10);
    await engine.close();
  });

  it('resolves file path to content module directory for writes', async () => {
    const tempContent = await mkdtemp(resolve(tmpdir(), 'scp-content-write-'));
    cpSync(CONTENT_ROOT, tempContent, { recursive: true });

    const tempPrimary = await mkdtemp(resolve(tmpdir(), 'scp-primary-write-'));
    cpSync(FIXTURES, tempPrimary, { recursive: true });

    const engine = new Engine({
      rootDir: tempPrimary,
      contentPaths: [tempContent],
    });
    await engine.init();

    // Home item exists from content root
    const home = engine.getItemByPath('/sitecore/content/Site/Home');
    expect(home).toBeDefined();
    expect(home!.module).toBe('Migration.Content');

    await engine.close();
    await rm(tempContent, { recursive: true, force: true });
    await rm(tempPrimary, { recursive: true, force: true });
  });

  it('watches content path for new files', async () => {
    const tempContent = await mkdtemp(resolve(tmpdir(), 'scp-content-watch-'));
    cpSync(CONTENT_ROOT, tempContent, { recursive: true });

    const onChange = vi.fn();
    const engine = new Engine({
      rootDir: FIXTURES,
      contentPaths: [tempContent],
      watch: true,
      onItemChange: onChange,
    });
    await engine.init();

    // Write a new YAML file into the content directory
    const newItemYaml = `---
ID: "cc000001-0000-0000-0000-000000000099"
Parent: "cc000001-0000-0000-0000-000000000001"
Template: "a1b2c3d4-e5f6-7890-abcd-000000000001"
Path: /sitecore/content/Site/Home/Contact
SharedFields: []
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "75577384-3c97-45da-a847-81b00500e250"
      Hint: Title
      Value: Contact Us
`;
    const contactDir = resolve(tempContent, 'items/home/Contact');
    await mkdir(contactDir, { recursive: true });
    await writeFile(resolve(contactDir, 'Contact.yml'), newItemYaml);

    // Wait for watcher to pick it up
    await new Promise(r => setTimeout(r, 1000));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'added', itemPath: '/sitecore/content/Site/Home/Contact' })
    );

    const contact = engine.getItemByPath('/sitecore/content/Site/Home/Contact');
    expect(contact).toBeDefined();

    await engine.close();
    await rm(tempContent, { recursive: true, force: true });
  });

  it('survives an unparseable file landing in a watched dir without crashing', async () => {
    const tempContent = await mkdtemp(resolve(tmpdir(), 'scp-content-bad-'));
    cpSync(CONTENT_ROOT, tempContent, { recursive: true });

    const onChange = vi.fn();
    const engine = new Engine({
      rootDir: FIXTURES,
      contentPaths: [tempContent],
      watch: true,
      onItemChange: onChange,
    });
    await engine.init();

    const badDir = resolve(tempContent, 'items/home/Bogus');
    await mkdir(badDir, { recursive: true });
    await writeFile(resolve(badDir, 'Bogus.yml'), 'not valid SCS YAML\nno header at all\n');

    await new Promise(r => setTimeout(r, 500));

    const home = engine.getItemByPath('/sitecore/content/Site/Home');
    expect(home).toBeDefined();
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ itemPath: expect.stringContaining('Bogus') })
    );

    await engine.close();
    await rm(tempContent, { recursive: true, force: true });
  });
});
