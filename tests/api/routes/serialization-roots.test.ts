import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../../src/api/server.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;
let dir: string;
let moduleFilePath: string;

function buildFixture(): { dir: string; moduleFilePath: string; registryPath: string } {
  const d = mkdtempSync(join(tmpdir(), 'mb-sr-api-'));

  writeFileSync(
    join(d, 'sitecore.json'),
    JSON.stringify({ modules: ['serialization/*.module.json'] }, null, 2),
  );

  mkdirSync(join(d, 'serialization'), { recursive: true });

  const mp = join(d, 'serialization', 'existing.module.json');
  writeFileSync(
    mp,
    JSON.stringify({
      namespace: 'Existing',
      items: {
        path: 'items',
        includes: [
          { name: 'content', path: '/sitecore/content/Site', database: 'master' },
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
        {
          id: 'aaaa0001-0000-0000-0000-000000000001',
          name: 'Commands',
          parent: '00000000-0000-0000-0000-000000000000',
          template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
          path: '/sitecore/system/Tasks/Commands',
          database: 'master',
          sharedFields: {},
        },
      ],
    }),
  );

  return { dir: d, moduleFilePath: mp, registryPath: rp };
}

beforeEach(async () => {
  const fixture = buildFixture();
  dir = fixture.dir;
  moduleFilePath = fixture.moduleFilePath;
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

describe('serialization-roots API', () => {
  it('GET lists discovered modules with includes', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/serialization-roots' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.modules.some((m: { namespace: string }) => m.namespace === 'Existing')).toBe(true);
  });

  it('POST dry-run returns a proposal and writes nothing', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/serialization-roots',
      payload: {
        path: '/sitecore/system/Tasks/Commands',
        target: { newFile: true },
        dryRun: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(false);
  });

  it('POST accept appends and returns 201', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/serialization-roots',
      payload: {
        path: '/sitecore/system/Tasks/Commands',
        target: { modulePath: moduleFilePath },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().applied).toBe(true);
  });

  it('maps path-not-found to 404', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/serialization-roots',
      payload: {
        path: '/sitecore/system/Nope',
        target: { newFile: true },
      },
    });
    expect(res.statusCode).toBe(404);
  });
});
