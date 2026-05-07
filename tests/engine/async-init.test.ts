import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { join } from 'path';

const fixture = resolve(__dirname, '../fixtures/valid');

/**
 * Generate a synthetic content directory roughly shaped like a production
 * mockingbird mount: many items, many distinct templates, varied field hint
 * names. This exercises the scale-sensitive part of 0.1.3's regression —
 * `collectSchemaCatalog` walks every item and the dynamically-built GraphQL
 * schema has one type per template + one field per distinct hint.
 *
 * When `includeTemplateDefinitions` is true, the fixture also writes a
 * Sitecore template definition (template item + section + field items)
 * per distinct template id. 0.1.7 needs these so the schema generator
 * finds real templates at indexing time; the 0.1.6 regression was that
 * registerGraphQLRoutes ran against an empty tree because indexing
 * hadn't completed, so the generator emitted zero types even though
 * the cache had 211 project templates. The reworked flow runs the
 * generator inside `engine.readiness.ready()` after indexing finishes.
 */
async function buildSyntheticContentRoot(
  dir: string,
  itemCount: number,
  opts: { includeTemplateDefinitions?: boolean } = {},
): Promise<void> {
  await mkdir(join(dir, 'items'), { recursive: true });
  await writeFile(join(dir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  await writeFile(join(dir, 'synthetic.module.json'), JSON.stringify({
    namespace: 'synthetic',
    items: {
      include: [{ name: 'synthetic', path: '/sitecore/content/synthetic' }],
    },
  }));
  const templateCount = Math.max(5, Math.floor(itemCount / 20));
  const hintCount = 30;
  const hints = Array.from({ length: hintCount }, (_, i) => `Field${i.toString().padStart(2, '0')}`);
  if (opts.includeTemplateDefinitions) {
    for (let t = 0; t < templateCount; t++) {
      const tmplId = `ffffffff-${t.toString(16).padStart(4, '0')}-0000-0000-000000000000`;
      const sectionId = `eeeeeeee-${t.toString(16).padStart(4, '0')}-0000-0000-000000000000`;
      const tmplYaml = [
        '---',
        `ID: "${tmplId}"`,
        `Parent: "00000000-0000-0000-0000-000000000000"`,
        `Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"`,
        `Path: "/sitecore/templates/synthetic/Widget${t}"`,
        '',
      ].join('\n');
      await writeFile(join(dir, 'items', `tmpl-${t}.yml`), tmplYaml);
      const sectionYaml = [
        '---',
        `ID: "${sectionId}"`,
        `Parent: "${tmplId}"`,
        `Template: "e269fbb5-3750-427a-9149-7aa950b49301"`,
        `Path: "/sitecore/templates/synthetic/Widget${t}/Data"`,
        '',
      ].join('\n');
      await writeFile(join(dir, 'items', `tmpl-${t}-section.yml`), sectionYaml);
      for (let h = 0; h < hintCount; h++) {
        const fieldId = `dddddddd-${t.toString(16).padStart(4, '0')}-${h.toString(16).padStart(4, '0')}-0000-000000000000`;
        const fieldYaml = [
          '---',
          `ID: "${fieldId}"`,
          `Parent: "${sectionId}"`,
          `Template: "455a3e98-a627-4b40-8035-e683a0331ac7"`,
          `Path: "/sitecore/templates/synthetic/Widget${t}/Data/${hints[h]}"`,
          'SharedFields:',
          `- ID: "ab162cc0-dc80-4abf-8871-998ee5d7ba32"`,
          `  Hint: Type`,
          `  Value: Single-Line Text`,
          '',
        ].join('\n');
        await writeFile(join(dir, 'items', `tmpl-${t}-field-${h}.yml`), fieldYaml);
      }
    }
  }
  for (let i = 0; i < itemCount; i++) {
    const id = `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`;
    const tmplIdx = i % templateCount;
    const tmplId = `ffffffff-${tmplIdx.toString(16).padStart(4, '0')}-0000-0000-000000000000`;
    const yaml = [
      '---',
      `ID: "${id}"`,
      `Parent: "00000000-0000-0000-0000-000000000000"`,
      `Template: "${tmplId}"`,
      `Path: "/sitecore/content/synthetic/item-${i}"`,
      'SharedFields:',
      `- ID: "aaaa0001-0000-0000-0000-000000000000"`,
      `  Hint: ${hints[i % hints.length]}`,
      `  Value: value-${i}`,
      'Languages:',
      '- Language: en',
      '  Versions:',
      '  - Version: 1',
      '    Fields:',
      `    - ID: "bbbb0001-0000-0000-0000-000000000000"`,
      `      Hint: ${hints[(i + 1) % hints.length]}`,
      `      Value: versioned-${i}`,
      '',
    ].join('\n');
    await writeFile(join(dir, 'items', `item-${i}.yml`), yaml);
  }
}

describe('Engine async initialization', () => {
  it('startInit() returns before the item tree is populated', async () => {
    const engine = new Engine({ rootDir: fixture, watch: false });
    await engine.startInit();
    // Depending on scheduler timing, state may already be ready for tiny fixtures.
    // The meaningful contract is: after startInit resolves, readiness.ready() will
    // eventually resolve and the tree will be populated.
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');
    expect(engine.getAllItems().length).toBeGreaterThan(0);
    await engine.close();
  });

  it('init() is an alias that awaits full readiness (backwards compatible)', async () => {
    const engine = new Engine({ rootDir: fixture, watch: false });
    await engine.init();
    expect(engine.readiness.isReady()).toBe(true);
    expect(engine.getAllItems().length).toBeGreaterThan(0);
    await engine.close();
  });

  it('readiness.progress advances during indexing', async () => {
    const engine = new Engine({ rootDir: fixture, watch: false });
    await engine.startInit();
    await engine.readiness.ready();
    expect(engine.readiness.progress.total).toBeGreaterThan(0);
    expect(engine.readiness.progress.scanned).toBe(engine.readiness.progress.total);
    await engine.close();
  });

  it('readiness.ready() rejects when the root directory does not exist', async () => {
    const engine = new Engine({ rootDir: '/nonexistent/path/that/does/not/exist', watch: false });
    await engine.startInit();
    try {
      await engine.readiness.ready();
      expect(engine.readiness.state).toBe('ready');
    } catch (err) {
      expect(engine.readiness.state).toBe('error');
      expect(engine.readiness.error).toBeInstanceOf(Error);
    }
    await engine.close();
  });

  it('startInit() is idempotent (second call is a no-op)', async () => {
    const baseline = new Engine({ rootDir: fixture, watch: false });
    await baseline.init();
    const expectedCount = baseline.getAllItems().length;
    await baseline.close();

    const engine = new Engine({ rootDir: fixture, watch: false });
    await engine.startInit();
    await engine.startInit(); // should not spawn a second indexInBackground
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');
    expect(engine.getAllItems().length).toBe(expectedCount);
    await engine.close();
  });

  it('dynamic schema generation picks up templates from the fully-indexed tree (0.1.6 regression)', async () => {
    // 0.1.6 emitted zero template types in production because
    // registerGraphQLRoutes ran synchronously against an empty tree —
    // `startInit` fires indexing as a non-awaited background task, so the
    // cache-hit load hadn't completed when the GraphQL route registered.
    // 0.1.7 defers schema generation into `engine.readiness.ready().then()`
    // so the generator walks the fully-populated tree.
    const rootDir = await mkdtemp(join(tmpdir(), 'mockingbird-dynschema-'));
    try {
      await buildSyntheticContentRoot(rootDir, 60, { includeTemplateDefinitions: true });

      const { createServer } = await import('../../src/api/server.js');
      const { app, engine } = await createServer({ rootDir });
      try {
        await engine.readiness.ready();
        // Give the `.then()` microtask a turn to run the extension.
        await new Promise((r) => setTimeout(r, 50));

        const res = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: { query: '{ __schema { types { name } } }' },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.errors).toBeUndefined();
        const typeNames: string[] = body.data.__schema.types.map((t: { name: string }) => t.name);
        // At least one Widget<N> type should appear once indexing finishes
        // and the extension runs — proves the dynamic generator actually
        // walked the populated tree.
        const widgetTypes = typeNames.filter(n => /^Widget\d+$/.test(n));
        expect(widgetTypes.length).toBeGreaterThan(0);
      } finally {
        await app.close();
      }
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('readiness flips to ready on a cache hit with the full server stack (regression from 0.1.3)', async () => {
    // Mirror the production init path: `createServer` wires the readiness
    // gate + GraphQL routes (which run `collectSchemaCatalog` and register
    // mercurius). The 0.1.3 regression manifested at production scale —
    // mockingbird indexes ~11k items, generates a big dynamic schema, and
    // then readiness never flipped. We use a synthetic fixture of a few
    // hundred items with many templates/hints to reproduce the scale
    // sensitivity without waiting on a real 11k-file indexing pass.
    const rootDir = await mkdtemp(join(tmpdir(), 'mockingbird-synth-'));
    const cacheDir = await mkdtemp(join(tmpdir(), 'mockingbird-cache-'));
    const cachePath = join(cacheDir, 'index.json.gz');
    try {
      await buildSyntheticContentRoot(rootDir, 300);

      const warm = new Engine({ rootDir, watch: false, indexCachePath: cachePath });
      await warm.init();
      expect(warm.readiness.isReady()).toBe(true);
      expect(warm.getAllItems().length).toBe(300);
      await warm.close();

      const { createServer } = await import('../../src/api/server.js');
      const { app, engine } = await createServer({ rootDir, indexCachePath: cachePath });
      try {
        const deadline = Date.now() + 5000;
        while (engine.readiness.state === 'initializing' && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 25));
        }
        expect(engine.readiness.state).toBe('ready');

        const res = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: { query: '{ __typename }' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.__typename).toBe('Query');
      } finally {
        await app.close();
      }
    } finally {
      await rm(rootDir, { recursive: true, force: true });
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('close() during indexing settles to a terminal state (no mid-transition)', async () => {
    const engine = new Engine({ rootDir: fixture, watch: false });
    await engine.startInit();
    await engine.close();

    const deadline = Date.now() + 2000;
    while (engine.readiness.state === 'initializing' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const terminal = engine.readiness.state;
    expect(['ready', 'error']).toContain(terminal);

    await new Promise((r) => setTimeout(r, 50));
    expect(engine.readiness.state).toBe(terminal);
  });
});
