// tests/spe/integration/screenshot-script.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, cpSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { Engine } from '../../../src/engine/index.js';
import { registerItemRoutes } from '../../../src/api/routes/items.js';
import { registerTreeRoutes } from '../../../src/api/routes/tree.js';
import { registerSpeRoutes } from '../../../src/api/routes/spe.js';
import { SessionManager } from '../../../src/spe/host/session-manager.js';
import type { Frame } from '../../../src/spe/host/types.js';

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
const PSD1 = resolve(REPO_ROOT, 'src/spe/module/Mockingbird.psd1');
const FIXTURES = resolve(REPO_ROOT, 'tests/fixtures/valid');

const describeIfReady = (HAS_PWSH && existsSync(DLL)) ? describe : describe.skip;

describeIfReady('SPE screenshot script end-to-end', () => {
  it('Get-ChildItem -Recurse | ForEach-Object | PSCustomObject roundtrips', async () => {
    const fixtureDir = mkdtempSync(resolve(tmpdir(), 'mockingbird-screenshot-'));
    cpSync(FIXTURES, fixtureDir, { recursive: true });
    const engine = new Engine({ rootDir: fixtureDir });
    await engine.init();

    const app = Fastify();
    await app.register(websocket);
    registerItemRoutes(app, engine);
    registerTreeRoutes(app, engine);
    const manager = new SessionManager({
      providerDllPath: DLL,
      moduleManifestPath: PSD1,
      apiUrl: 'http://127.0.0.1:0',
    });
    registerSpeRoutes(app, manager);
    await app.listen({ port: 0 });
    const port = (app.server.address() as { port: number }).port;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (manager as any).opts.apiUrl = `http://127.0.0.1:${port}`;

    try {
      const session = await manager.create();
      const frames: Frame[] = [];
      manager.subscribe(session.sessionId, (f) => frames.push(f));

      // Note: kept as a single line so the writeLine() call sends one parse
      // unit to pwsh's stdin. Multi-line scripts work too in principle, but
      // collapsing the screenshot script to one line keeps the test
      // deterministic against pwsh's stdin parser quirks (newlines inside an
      // open scriptblock are handled differently than newlines at top level).
      const script =
        `$rootPath = '/sitecore/templates/Project';` +
        `Get-ChildItem -Path "master:$rootPath" -Recurse | ForEach-Object { ` +
        `  $name = $_.Name; ` +
        `  if (-not [string]::IsNullOrEmpty($name)) { ` +
        `    [PSCustomObject]@{ Path = $_.Paths.FullPath; Name = $name } ` +
        `  } ` +
        `}`;
      const result = manager.execute(session.sessionId, { script, applyMode: false });
      if ('error' in result) throw new Error(result.error);
      await new Promise<void>((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout')), 20_000);
        const i = setInterval(() => {
          if (frames.find(f => f.type === 'runComplete')) {
            clearTimeout(t); clearInterval(i); res();
          }
        }, 50);
      });

      const out = frames
        .filter(f => f.type === 'stream' && f.stream === 'stdout')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map(f => (f as any).data)
        .join('\n');
      expect(out).toContain('MyProject');
      expect(out).toContain('MyTemplate');
      expect(out).toContain('/sitecore/templates/Project'); // Path column populated
    } finally {
      await manager.disposeAll();
      await app.close();
      await engine.close();
    }
  }, 60_000);
});
