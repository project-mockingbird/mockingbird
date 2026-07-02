import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

// Registry-only parent: /sitecore/system/Tasks/Commands
const COMMANDS_ID = 'aaaa0001-0000-0000-0000-000000000001';
// Plain registry template item used as the insert template
const FIXTURE_TEMPLATE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

/**
 * Minimal fixture:
 *  - sitecore.json -> serialization/*.module.json
 *  - serialization/commands.module.json with a DescendantsOnly include at
 *    /sitecore/system/Tasks/Commands (scope = DescendantsOnly, items under
 *    serialization/items/commands/)
 *  - registry.json with Commands (the registry-only parent) and a plain
 *    template item to use as the insert template
 */
function buildFixture(): { dir: string; registryPath: string } {
  const d = mkdtempSync(join(tmpdir(), 'mb-insert-reg-parent-'));

  writeFileSync(
    join(d, 'sitecore.json'),
    JSON.stringify({ modules: ['serialization/*.module.json'] }, null, 2),
  );

  mkdirSync(join(d, 'serialization'), { recursive: true });
  // Create the include on-disk root so the engine can route writes there
  mkdirSync(join(d, 'serialization', 'items', 'commands'), { recursive: true });

  writeFileSync(
    join(d, 'serialization', 'commands.module.json'),
    JSON.stringify({
      namespace: 'Commands',
      items: {
        path: 'items',
        includes: [
          {
            name: 'commands',
            path: '/sitecore/system/Tasks/Commands',
            scope: 'DescendantsOnly',
            database: 'master',
          },
        ],
      },
    }, null, 2) + '\n',
  );

  const rp = join(d, 'registry.json');
  writeFileSync(
    rp,
    JSON.stringify({
      version: '1.0',
      source: 'test',
      extractedAt: new Date().toISOString(),
      items: [
        // Registry-only parent - has no serialized YAML on disk
        {
          id: COMMANDS_ID,
          name: 'Commands',
          parent: '00000000-0000-0000-0000-000000000000',
          template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
          path: '/sitecore/system/Tasks/Commands',
          database: 'master',
          sharedFields: {},
        },
        // Plain template item (template field = TEMPLATE_TEMPLATE_ID so
        // insertItemAtParent takes the simple skeleton path, not branch/command)
        {
          id: FIXTURE_TEMPLATE_ID,
          name: 'FolderType',
          parent: '00000000-0000-0000-0000-000000000000',
          template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
          path: '/sitecore/templates/FolderType',
          database: 'master',
          sharedFields: {},
        },
      ],
    }),
  );

  return { dir: d, registryPath: rp };
}

let app: FastifyInstance | null = null;
let dir: string;

beforeEach(async () => {
  const fixture = buildFixture();
  dir = fixture.dir;
  const created = await createServer({ rootDir: dir, registryPath: fixture.registryPath });
  app = created.app;
  await created.engine.readiness.ready();
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/items fromTemplate with registry-only parent', () => {
  it('returns 201 and places the YAML under the include on-disk root', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/items',
      payload: {
        type: 'fromTemplate',
        name: 'MyCommand',
        parentPath: '/sitecore/system/Tasks/Commands',
        templateId: FIXTURE_TEMPLATE_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    // The YAML must land under the include's on-disk root:
    // <dir>/serialization/items/commands/MyCommand.yml
    const expectedDir = join(dir, 'serialization', 'items', 'commands');
    expect(body.filePath).toContain(expectedDir);
    expect(body.filePath).toMatch(/MyCommand\.yml$/i);
  });

  it('still returns 404 for a path absent from both tree and registry', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/items',
      payload: {
        type: 'fromTemplate',
        name: 'NoParent',
        parentPath: '/sitecore/system/Tasks/Nonexistent',
        templateId: FIXTURE_TEMPLATE_ID,
      },
    });
    expect(res.statusCode).toBe(404);
  });
});
