// tests/spe/integration/cmdlets.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, cpSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { Engine } from '../../../src/engine/index.js';
import { registerItemRoutes } from '../../../src/api/routes/items.js';
import { registerTreeRoutes } from '../../../src/api/routes/tree.js';
import { registerSpeRoutes } from '../../../src/api/routes/spe.js';
import { SessionManager } from '../../../src/spe/host/session-manager.js';
import type { Frame } from '../../../src/spe/host/types.js';

// Resolve repo root from this test file's URL so the absolute paths to the
// provider DLL + module manifest are stable regardless of where vitest runs.
const __testDir = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__testDir, '../../..');

const HAS_PWSH = (() => {
  try {
    execSync('pwsh -NoProfile -Command "exit 0"', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const DLL = resolve(REPO_ROOT, 'data/spe/Mockingbird.Provider.dll');
const HAS_DLL = existsSync(DLL);
const PSD1 = resolve(REPO_ROOT, 'src/spe/module/Mockingbird.psd1');
const FIXTURES = resolve(REPO_ROOT, 'tests/fixtures/valid');

const describeIfReady = (HAS_PWSH && HAS_DLL) ? describe : describe.skip;

describeIfReady('SPE cmdlets end-to-end', () => {
  let app: FastifyInstance;
  let manager: SessionManager;
  let port: number;
  let engine: Engine;
  let fixtureDir: string;

  beforeAll(async () => {
    fixtureDir = mkdtempSync(resolve(tmpdir(), 'mockingbird-cmdlets-'));
    cpSync(FIXTURES, fixtureDir, { recursive: true });
    engine = new Engine({ rootDir: fixtureDir });
    await engine.init();

    app = Fastify();
    await app.register(websocket);
    registerItemRoutes(app, engine);
    registerTreeRoutes(app, engine);
    // Manager is created with apiUrl placeholder; we patch in the real port
    // after `app.listen`. SessionManager reads opts.apiUrl at child-spawn time
    // (per-create), so updating the field before calling create() is sufficient.
    manager = new SessionManager({
      providerDllPath: DLL,
      moduleManifestPath: PSD1,
      apiUrl: 'http://127.0.0.1:0',
    });
    registerSpeRoutes(app, manager);
    await app.listen({ port: 0 });
    port = (app.server.address() as { port: number }).port;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (manager as any).opts.apiUrl = `http://127.0.0.1:${port}`;
  }, 60_000);

  afterAll(async () => {
    await manager.disposeAll();
    await app.close();
    await engine.close();
  });

  async function runScript(script: string, opts: { applyMode?: boolean } = {}): Promise<Frame[]> {
    const session = await manager.create();
    const frames: Frame[] = [];
    const sub = manager.subscribe(session.sessionId, (f) => frames.push(f))!;
    const exec = manager.execute(session.sessionId, { script, applyMode: opts.applyMode ?? false });
    if ('error' in exec) throw new Error(`execute: ${exec.error}`);
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout waiting for runComplete')), 15_000);
      const interval = setInterval(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (frames.find(f => f.type === 'runComplete' && (f as any).runId === exec.runId)) {
          clearTimeout(t); clearInterval(interval); res();
        }
      }, 50);
    });
    sub.unsubscribe();
    await manager.dispose(session.sessionId, 'explicit');
    return frames;
  }

  function streamText(frames: Frame[]): string {
    return frames
      .filter(f => f.type === 'stream' && (f.stream === 'stdout' || f.stream === 'info'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(f => (f as any).data)
      .join('\n');
  }

  it('Get-Item by path returns the item', async () => {
    const frames = await runScript(`Get-Item -Path '/sitecore/templates/Project/MyProject/MyTemplate' | ForEach-Object { $_.Name }`);
    expect(streamText(frames)).toContain('MyTemplate');
  });

  it('Get-Item by ID returns the item', async () => {
    const frames = await runScript(`Get-Item -ID 'a1b2c3d4-e5f6-7890-abcd-000000000001' | ForEach-Object { $_.Paths.FullPath }`);
    expect(streamText(frames)).toContain('/sitecore/templates/Project/MyProject/MyTemplate');
  });

  it('Get-ChildItem returns children via the PSDrive provider', async () => {
    const frames = await runScript(`Get-ChildItem -Path 'master:/sitecore/templates/Project' | ForEach-Object { $_.Name }`);
    expect(streamText(frames)).toContain('MyProject');
  });

  it('Set-ItemField in dry-run emits a diff frame', async () => {
    const frames = await runScript(`Get-Item -Path '/sitecore/templates/Project/MyProject/MyTemplate/Data/Title' | Set-ItemField -Name 'Type' -Value 'Multi-Line Text'`);
    expect(frames.find(f => f.type === 'diff')).toBeTruthy();
  });

  it('Find-Item with -eq returns matching items', async () => {
    const frames = await runScript(`Find-Item -Where { $_.Name -eq 'MyTemplate' } | ForEach-Object { $_.Paths.FullPath }`);
    expect(streamText(frames)).toContain('MyTemplate');
  });

  it('Find-Item with unsupported predicate throws a not-supported error', async () => {
    const frames = await runScript(`try { Find-Item -Where { $_.Name -match 'X' } } catch { Write-Output "ERR: $_" }`);
    expect(streamText(frames)).toMatch(/not supported/i);
  });

  it('Publish-Item throws a not-supported error', async () => {
    const frames = await runScript(`try { Publish-Item } catch { Write-Output "ERR: $($_.Exception.Message)" }`);
    expect(streamText(frames)).toMatch(/not supported/i);
  });

  // -----------------------------------------------------------------
  // Backlog #66: SPE-style edit-context writes
  // -----------------------------------------------------------------

  // The Standard Values item is the edit target throughout: it exists in the
  // fixture, owns a real Title shared field that's safe to mutate, and its
  // path is stable across test runs (the parent tree's IDs are pinned).
  const SV_PATH = '/sitecore/templates/Project/MyProject/MyTemplate/__Standard Values';

  it('edit-context dry-run emits a single diff frame for buffered fields', async () => {
    const frames = await runScript(`
      $item = Get-Item -Path '${SV_PATH}'
      $item.Editing.BeginEdit()
      $item['Title'] = 'Updated via edit-context'
      $item.Editing.EndEdit()
    `);
    const diffs = frames.filter(f => f.type === 'diff');
    expect(diffs).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((diffs[0] as any).operation).toContain('EndEdit on');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((diffs[0] as any).operation).toContain(SV_PATH);
  });

  it('edit-context apply commits the field to disk and a re-fetch sees the new value', async () => {
    const script = `
      $item = Get-Item -Path '${SV_PATH}'
      $item.Editing.BeginEdit()
      $item['Title'] = 'Applied via edit-context'
      $item.Editing.EndEdit()
      $after = Get-Item -Path '${SV_PATH}'
      Write-Output "AFTER: $($after['Title'])"
    `;
    const frames = await runScript(script, { applyMode: true });
    expect(streamText(frames)).toContain('AFTER: Applied via edit-context');
  });

  it('edit-context assignment without BeginEdit throws InvalidOperationException', async () => {
    const frames = await runScript(`
      $item = Get-Item -Path '${SV_PATH}'
      try { $item['Title'] = 'Should-Throw'; Write-Output 'NO-THROW' }
      catch { Write-Output "CAUGHT: $($_.Exception.Message)" }
    `);
    expect(streamText(frames)).toMatch(/CAUGHT:.*BeginEdit/);
  });

  it('edit-context CancelEdit drops pending changes and rolls back the local cache', async () => {
    const frames = await runScript(`
      $item = Get-Item -Path '${SV_PATH}'
      $original = $item['Title']
      $item.Editing.BeginEdit()
      $item['Title'] = 'Should-Not-Land'
      $item.Editing.CancelEdit()
      Write-Output "ORIGINAL: $original"
      Write-Output "AFTER-CANCEL: $($item['Title'])"
    `);
    const out = streamText(frames);
    expect(out).not.toContain('Should-Not-Land');
    expect(out).toMatch(/ORIGINAL: (.*)\r?\nAFTER-CANCEL: \1/);
    expect(frames.filter(f => f.type === 'diff')).toHaveLength(0);
  });

  it('edit-context nested BeginEdit only commits at the outermost EndEdit', async () => {
    const frames = await runScript(`
      $item = Get-Item -Path '${SV_PATH}'
      $item.Editing.BeginEdit()
      $item.Editing.BeginEdit()
      $item['Title'] = 'Nested-Edit-Test'
      $item.Editing.EndEdit()
      Write-Output "AFTER-INNER: $($item.Editing.IsEditing)"
      $item.Editing.EndEdit()
      Write-Output "AFTER-OUTER: $($item.Editing.IsEditing)"
    `);
    const diffs = frames.filter(f => f.type === 'diff');
    expect(diffs).toHaveLength(1);
    const out = streamText(frames);
    expect(out).toContain('AFTER-INNER: True');
    expect(out).toContain('AFTER-OUTER: False');
  });

  it('edit-context buffers multiple field writes into one PUT', async () => {
    const frames = await runScript(`
      $item = Get-Item -Path '${SV_PATH}'
      $item.Editing.BeginEdit()
      $item['Title'] = 'New Title'
      $item.Editing.EndEdit()
    `);
    const diffs = frames.filter(f => f.type === 'diff');
    expect(diffs).toHaveLength(1);
  });
}, 60_000);
