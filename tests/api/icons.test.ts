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
    // Percent-encode the dot-segments (including the slashes, as %2f) so the
    // WHATWG URL parser inside app.inject() does not collapse "../../" down
    // to "/package.json" before Fastify routes the request - that would
    // route it straight to the SPA index.html fallback (200) and never
    // reach our handler's traversal guard at all. The encoded form survives
    // intact, find-my-way decodes the wildcard param back to
    // "../../package.json", and our guard in icons.ts correctly rejects it.
    // Do not "simplify" this back to a literal "../../package.json" string.
    const res = await app.inject({ method: 'GET', url: '/api/icon/%2e%2e%2f%2e%2e%2fpackage.json' });
    expect(res.statusCode).toBe(404);
  });

  it('status reports iconsEnabled true whenever a sprite set is baked (no switch required)', async () => {
    // The MOCKINGBIRD_ICONS switch was removed; icons are on whenever a baked
    // set is present. Prove the flag has no bearing by clearing it.
    const saved = process.env.MOCKINGBIRD_ICONS;
    delete process.env.MOCKINGBIRD_ICONS;
    try {
      const res = await app.inject({ method: 'GET', url: '/api/status' });
      expect(res.json().iconsEnabled).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.MOCKINGBIRD_ICONS; else process.env.MOCKINGBIRD_ICONS = saved;
    }
  });

  it('status reports iconsEnabled false when no sprite set is baked', async () => {
    const saved = process.env.MOCKINGBIRD_ICON_ROOT;
    process.env.MOCKINGBIRD_ICON_ROOT = resolve(tempDir, 'no-icons-here');
    try {
      const res = await app.inject({ method: 'GET', url: '/api/status' });
      expect(res.json().iconsEnabled).toBe(false);
    } finally {
      process.env.MOCKINGBIRD_ICON_ROOT = saved!;
    }
  });
});

describe('icon listing endpoints', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let iconRoot: string;
  const savedRoot = process.env.MOCKINGBIRD_ICON_ROOT;
  const savedSwitch = process.env.MOCKINGBIRD_ICONS;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-iconlist-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    iconRoot = resolve(tempDir, 'sitecore-icons');
    // Two curated folders + one non-curated (V2) folder, all at 32x32.
    for (const rel of ['Office/32x32/folder.png', 'Network/32x32/home.png', 'ApplicationsV2/32x32/gear.png']) {
      await mkdir(resolve(iconRoot, rel, '..'), { recursive: true });
      await writeFile(resolve(iconRoot, rel), PNG_1x1);
    }
    process.env.MOCKINGBIRD_ICON_ROOT = iconRoot;
    // Deliberately do NOT set MOCKINGBIRD_ICONS - the listing endpoints must
    // work whenever a sprite set is baked, with no switch.
    delete process.env.MOCKINGBIRD_ICONS;
    const result = await createServer({ rootDir: tempDir });
    app = result.app;
    await result.engine.readiness.ready();
  });
  afterEach(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
    if (savedRoot === undefined) delete process.env.MOCKINGBIRD_ICON_ROOT; else process.env.MOCKINGBIRD_ICON_ROOT = savedRoot;
    if (savedSwitch === undefined) delete process.env.MOCKINGBIRD_ICONS; else process.env.MOCKINGBIRD_ICONS = savedSwitch;
  });

  it('lists curated categories present in the set plus an All catch-all', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/icons/categories' });
    expect(res.statusCode).toBe(200);
    const cats = res.json() as Array<{ key: string; label: string }>;
    const keys = cats.map(c => c.key);
    expect(keys).toContain('Office');
    expect(keys).toContain('Network');
    expect(keys).not.toContain('ApplicationsV2'); // non-curated, reachable only via All
    expect(cats[cats.length - 1]).toEqual({ key: '*', label: 'All icons' });
    // A curated folder that is not baked must be absent.
    expect(keys).not.toContain('People');
  });

  it('lists a category\'s 32x32 paths sorted', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/icons?category=Office' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(['Office/32x32/folder.png']);
  });

  it('All spans every folder including non-curated ones', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/icons?category=*' });
    const list = res.json() as string[];
    expect(list).toContain('ApplicationsV2/32x32/gear.png');
    expect(list).toContain('Office/32x32/folder.png');
    expect(list).toEqual([...list].sort((a, b) => a.localeCompare(b)));
  });

  it('400s when category is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/icons' });
    expect(res.statusCode).toBe(400);
  });

  it('404s the listing endpoints when no sprite set is baked', async () => {
    const saved = process.env.MOCKINGBIRD_ICON_ROOT;
    process.env.MOCKINGBIRD_ICON_ROOT = resolve(tempDir, 'no-icons-here');
    try {
      const a = await app.inject({ method: 'GET', url: '/api/icons/categories' });
      const b = await app.inject({ method: 'GET', url: '/api/icons?category=Office' });
      expect(a.statusCode).toBe(404);
      expect(b.statusCode).toBe(404);
    } finally {
      process.env.MOCKINGBIRD_ICON_ROOT = saved!;
    }
  });
});
