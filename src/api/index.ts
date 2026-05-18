import { resolve, dirname } from 'path';
import { createServer } from './server.js';
import { DEFAULT_WORKSPACE_ROOT, getWorkspaceRoot } from './state/workspace-path.js';

process.env.PORT ??= process.env.MOCKINGBIRD_PORT;
process.env.HOST ??= process.env.MOCKINGBIRD_HOST;
process.env.REGISTRY_PATH ??= './data/registry.json.gz';
// Container-internal workspace mount path. Replaces MOCKINGBIRD_WORKSPACE_ROOT
// (kept as a one-cycle deprecation alias). All routes read MOCKINGBIRD_WORKSPACE.
process.env.MOCKINGBIRD_WORKSPACE ??= process.env.MOCKINGBIRD_WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT;
// Default to .mockingbird/cache/ INSIDE the workspace mount so the engine cache
// rides in the workspace instead of a separate docker volume.
const workspaceForCache = getWorkspaceRoot();
process.env.MOCKINGBIRD_CACHE_PATH ??= resolve(workspaceForCache, '.mockingbird', 'cache');
process.env.INDEX_CACHE_PATH ??= resolve(process.env.MOCKINGBIRD_CACHE_PATH, 'index.json.gz');

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const registryPath = process.env.REGISTRY_PATH;
const indexCachePath = process.env.INDEX_CACHE_PATH;

// SCS_SITECORE_JSON is optional. When set, the engine boots into the named
// workspace (existing container-as-a-service deployment for head-app
// integrations). When unset, the server boots in no-project mode and the
// first-run wizard (UI) is responsible for picking a workspace at runtime.
const sitecoreJsonPath = process.env.SCS_SITECORE_JSON
  ? resolve(process.env.SCS_SITECORE_JSON)
  : undefined;
const rootDir = sitecoreJsonPath ? dirname(sitecoreJsonPath) : undefined;

const contentSitecoreJson = process.env.SCS_CONTENT_SITECORE_JSON;
const contentPaths = contentSitecoreJson ? [dirname(resolve(contentSitecoreJson))] : [];

async function main(): Promise<void> {
  const { app, engine, speManager } = await createServer({ rootDir, contentPaths, registryPath, indexCachePath, port, host });
  await app.listen({ port, host });

  // Eager pwsh primer: runs in parallel with engine indexing. The primer is
  // claimed by the first POST /api/spe/sessions, turning what was a 10-30s
  // cold spawn into a near-instant claim. `warmup()` never throws - failures
  // land in `speManager.state.error` and are exposed via /api/status as the
  // `speState` axis (independent of the engine `state:"ready"` axis).
  void speManager.warmup();

  // Graceful shutdown: docker compose stop / restart sends SIGTERM. Engine.close() writes a fresh cache so the next start is warm with in-session mutations included.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`  Received ${signal}, draining engine + writing cache before exit...`);
    try {
      await engine.close();
      await app.close();
      process.exit(0);
    } catch (err) {
      console.error('  Shutdown error:', err);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  console.log(`Mockingbird API`);
  console.log(`  Listening: http://${host}:${port}`);
  console.log(`  Registry: ${engine.isRegistryLoaded() ? `loaded (${engine.registrySize()} OOTB items)` : 'not loaded'}`);

  if (rootDir) {
    console.log(`  Indexing serialization in background...`);

    const indexStart = Date.now();
    let lastScanned = -1;
    const tick = setInterval(() => {
      if (engine.readiness.state !== 'initializing') return;
      const { scanned, total } = engine.readiness.progress;
      if (scanned === lastScanned) return;
      lastScanned = scanned;
      const pct = total > 0 ? Math.floor((scanned / total) * 100) : 0;
      console.log(`  [index] ${scanned}/${total} (${pct}%)`);
    }, 3000);
    tick.unref?.();

    engine.readiness
      .ready()
      .then(() => {
        clearInterval(tick);
        const secs = ((Date.now() - indexStart) / 1000).toFixed(1);
        console.log(`  Indexing complete: ${engine.getAllItems().length} items in ${secs}s`);
      })
      .catch((err) => {
        clearInterval(tick);
        console.error(`  Indexing failed:`, err);
      });
  } else {
    console.log(`  No project loaded. Open one via the web UI to begin authoring.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
