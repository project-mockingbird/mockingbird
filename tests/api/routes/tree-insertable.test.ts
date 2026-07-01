import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../../src/api/server.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

// Registry IDs for Commands (covered) and Schedules (uncovered).
const COMMANDS_ID = 'aaaa0001-0000-0000-0000-000000000001';
const SCHEDULES_ID = 'aaaa0001-0000-0000-0000-000000000002';

function buildFixture(): { dir: string; registryPath: string } {
  const d = mkdtempSync(join(tmpdir(), 'mb-insertable-'));

  // sitecore.json - points modules glob at serialization/
  writeFileSync(
    join(d, 'sitecore.json'),
    JSON.stringify({ modules: ['serialization/*.module.json'] }, null, 2),
  );

  mkdirSync(join(d, 'serialization'), { recursive: true });

  // Module with a DescendantsOnly include at /sitecore/system/Tasks/Commands.
  // This makes coversNewChildAt('/sitecore/system/Tasks/Commands') return true.
  // /sitecore/system/Tasks/Schedules has no covering include -> returns false.
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

  // Serialized child item under the Commands include.
  // Scanner looks in <moduleDir>/<items.path>/<include.name> = serialization/items/commands/
  mkdirSync(join(d, 'serialization', 'items', 'commands'), { recursive: true });
  writeFileSync(
    join(d, 'serialization', 'items', 'commands', 'SomeItem.yml'),
    [
      '---',
      `ID: "bbbb0001-0000-0000-0000-000000000001"`,
      `Parent: "${COMMANDS_ID}"`,
      'Template: "AB86861A-6030-46C5-B394-E8F99E8B87DB"',
      'Path: /sitecore/system/Tasks/Commands/SomeItem',
      'SharedFields: []',
      'Languages: []',
    ].join('\n') + '\n',
  );

  // Registry with Commands (covered by module) and Schedules (no include).
  const rp = join(d, 'registry.json');
  writeFileSync(
    rp,
    JSON.stringify({
      version: '1.0',
      source: 'test',
      extractedAt: new Date().toISOString(),
      items: [
        {
          id: COMMANDS_ID,
          name: 'Commands',
          parent: '00000000-0000-0000-0000-000000000000',
          template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
          path: '/sitecore/system/Tasks/Commands',
          database: 'master',
          sharedFields: {},
        },
        {
          id: SCHEDULES_ID,
          name: 'Schedules',
          parent: '00000000-0000-0000-0000-000000000000',
          template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
          path: '/sitecore/system/Tasks/Schedules',
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

describe('tree insertable flag', () => {
  it('marks a covered registry node insertable', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/tree?root=/sitecore/system/Tasks/Commands' });
    expect(res.statusCode).toBe(200);
    expect(res.json().insertable).toBe(true);
  });

  it('marks an uncovered registry node not insertable', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/tree?root=/sitecore/system/Tasks/Schedules' });
    expect(res.statusCode).toBe(200);
    expect(res.json().insertable).toBe(false);
  });

  it('marks a serialized node insertable', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/tree?root=/sitecore/system/Tasks/Commands/SomeItem' });
    expect(res.statusCode).toBe(200);
    expect(res.json().insertable).toBe(true);
  });
});
