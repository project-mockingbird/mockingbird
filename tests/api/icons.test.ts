import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
// 1x1 transparent PNG.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('GET /api/icon/*', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let iconRoot: string;
  const savedRoot = process.env.MOCKINGBIRD_ICON_ROOT;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-icons-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    // Bake a tiny icon set: Office/32x32/folder.png (capital O on disk).
    iconRoot = resolve(tempDir, 'sitecore-icons');
    await mkdir(resolve(iconRoot, 'Office/32x32'), { recursive: true });
    await writeFile(resolve(iconRoot, 'Office/32x32/folder.png'), PNG_1x1);
    process.env.MOCKINGBIRD_ICON_ROOT = iconRoot;
    const result = await createServer({ rootDir: tempDir });
    app = result.app;
    await result.engine.readiness.ready();
  });
  afterEach(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
    if (savedRoot === undefined) delete process.env.MOCKINGBIRD_ICON_ROOT;
    else process.env.MOCKINGBIRD_ICON_ROOT = savedRoot;
  });

  it('serves a sprite case-insensitively with an immutable cache header', async () => {
    // Request lowercase; file on disk is Office/32x32/folder.png.
    const res = await app.inject({ method: 'GET', url: '/api/icon/office/32x32/folder.png' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.rawPayload.length).toBe(PNG_1x1.length);
  });

  it('strips a leading -/icon/ prefix', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/icon/-/icon/Office/32x32/folder.png' });
    expect(res.statusCode).toBe(200);
  });

  it('404s a missing sprite', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/icon/Office/32x32/nope.png' });
    expect(res.statusCode).toBe(404);
  });

  it('404s a path-traversal attempt', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/icon/../../package.json' });
    expect(res.statusCode).toBe(404);
  });
});
