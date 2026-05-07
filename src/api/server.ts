import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';
import { multistream } from 'pino';
import { Engine } from '../engine/index.js';
import { registerWebSocket } from './websocket.js';
import { notifyItemChange } from './notify.js';
import { registerReadinessGate } from './hooks/readiness-gate.js';
import { registerStatusRoute } from './routes/status.js';
import { SessionManager } from '../spe/host/session-manager.js';
import { registerSpeRoutes } from './routes/spe.js';
import { serverLogBuffer } from './logging/buffers.js';
import { createPinoBridge } from './logging/pino-bridge.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  rootDir: string;
  contentPaths?: string[];
  registryPath?: string;
  indexCachePath?: string;
}

export async function createServer(opts: ServerOptions): Promise<{ app: FastifyInstance; engine: Engine; speManager: SessionManager }> {
  const bridge = createPinoBridge(serverLogBuffer);
  // Pass the multistream as the `stream` field of Fastify's logger config
  // rather than a pre-built pino instance via `loggerInstance`. The latter
  // works at runtime but causes a generic-type cascade through Fastify's
  // `FastifyInstance<Logger<...>>` that breaks strict-tsc downstream.
  const app = Fastify({
    logger: {
      level: process.env.MOCKINGBIRD_LOG_LEVEL ?? 'info',
      stream: multistream([
        { stream: process.stdout },
        { stream: bridge },
      ]),
    },
  });

  const engine = new Engine({
    rootDir: opts.rootDir,
    contentPaths: opts.contentPaths,
    watch: true,
    registryPath: opts.registryPath,
    indexCachePath: opts.indexCachePath,
    onItemChange: (event) => notifyItemChange(engine, event),
  });

  await engine.startInit();

  // CORS: default policy allows ONLY same-origin (no Origin header at all,
  // which is what same-origin browser requests look like, plus non-browser
  // callers like the CLI / curl). Cross-origin browser tabs are rejected
  // unless explicitly listed in MOCKINGBIRD_ALLOWED_ORIGINS (comma-separated
  // full origins, e.g. `http://localhost:3000,https://app.local`). Without
  // this, any same-browser tab can PUT/POST/DELETE to /api/items/* via
  // CSRF; this is the primary CSRF surface for a localhost dev tool.
  const allowedOrigins = (process.env.MOCKINGBIRD_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) { cb(null, true); return; }
      if (allowedOrigins.includes(origin)) { cb(null, true); return; }
      cb(null, false);
    },
    credentials: true,
    // Custom response headers cross-origin browser fetches need to read.
    // Without this list, `fetch(...).headers.get('X-Mockingbird-...')`
    // returns null even when the server set the header. Currently used by
    // the package-builder route (POST /api/package) to surface build
    // warnings + item count alongside the zip body.
    exposedHeaders: [
      'X-Mockingbird-Package-Warnings',
      'X-Mockingbird-Package-Item-Count',
    ],
  });

  await app.register(websocket);

  // SPE (PowerShell ISE) backend manager. Constructed before registerStatusRoute
  // so /api/status can expose its state (`speState` axis - independent of
  // engine `state:"ready"`). The actual SPE routes register further below.
  const __apiDirForSpe = fileURLToPath(new URL('.', import.meta.url));
  const repoRootForSpe = resolve(__apiDirForSpe, '../..');
  const providerDllPath = resolve(repoRootForSpe, 'data/spe/Mockingbird.Provider.dll');
  const moduleManifestPath = resolve(repoRootForSpe, 'src/spe/module/Mockingbird.psd1');
  const spePort = parseInt(process.env.PORT ?? '4444', 10);
  const speManager = new SessionManager({
    sessionTtlMin: parseInt(process.env.MOCKINGBIRD_SPE_SESSION_TTL_MIN ?? '30', 10),
    maxSessions: parseInt(process.env.MOCKINGBIRD_SPE_MAX_SESSIONS ?? '8', 10),
    providerDllPath: existsSync(providerDllPath) ? providerDllPath : undefined,
    moduleManifestPath: existsSync(moduleManifestPath) ? moduleManifestPath : undefined,
    apiUrl: `http://127.0.0.1:${spePort}`,
  });

  registerReadinessGate(app, engine.readiness);
  registerStatusRoute(app, engine, speManager);

  // Import and register routes (will be added incrementally)
  const { registerTreeRoutes } = await import('./routes/tree.js');
  registerTreeRoutes(app, engine);

  const { registerItemRoutes } = await import('./routes/items.js');
  registerItemRoutes(app, engine);

  const { registerLookupSourceRoutes } = await import('./routes/lookup-source.js');
  registerLookupSourceRoutes(app, engine);

  const { registerValidateRoutes } = await import('./routes/validate.js');
  const { registerSchemaRoutes } = await import('./routes/schema.js');
  const { registerModulesRoutes } = await import('./routes/modules.js');
  registerValidateRoutes(app, engine);
  registerSchemaRoutes(app, engine);
  registerModulesRoutes(app, opts.rootDir);

  // onRequest hook decorates request.site for graphql + sxa routes that read
  // it. Fastify applies addHook on the root app server-wide regardless of route
  // registration order; placement here is for co-location with the routes that
  // depend on it.
  const envFallback = process.env.SITE_ROOT_PATH ?? '';
  const { registerSiteContextHook } = await import('./hooks/site-context.js');
  registerSiteContextHook(app, engine, envFallback);

  const { registerGraphqlCapture } = await import('./logging/graphql-capture.js');
  await registerGraphqlCapture(app);

  const { registerGraphQLRoutes } = await import('./routes/graphql.js');
  await registerGraphQLRoutes(app, engine, {
    mediaBaseUrl: '',
  });

  const { registerMediaRoutes } = await import('./routes/media.js');
  registerMediaRoutes(app, engine);

  const { registerPackageRoutes } = await import('./routes/package.js');
  registerPackageRoutes(app, engine);

  const { registerRenderingsRoutes } = await import('./routes/renderings.js');
  registerRenderingsRoutes(app, engine);

  const { registerTemplatesRoutes } = await import('./routes/templates.js');
  registerTemplatesRoutes(app, engine);

  const { registerSxaRoutes } = await import('./routes/sxa.js');
  registerSxaRoutes(app, engine);

  registerWebSocket(app, engine);

  // SPE routes (manager constructed earlier so /api/status sees speState).
  // Caller is responsible for triggering `speManager.warmup()` after
  // createServer returns - production does this from src/api/index.ts,
  // test code skips it so jsdom/CI environments don't spawn real pwsh
  // children unintentionally.
  registerSpeRoutes(app, speManager);
  app.addHook('onClose', async () => {
    await speManager.disposeAll();
  });

  // Serve static Web UI if built
  const __apiDir = fileURLToPath(new URL('.', import.meta.url));
  const webOutDir = resolve(__apiDir, '../web/out');
  if (existsSync(webOutDir)) {
    await app.register(fastifyStatic, {
      root: webOutDir,
      prefix: '/',
      // decorateReply default true so notFoundHandler can call reply.sendFile.
    });

    // SPA fallback: any non-API path that isn't a static asset gets index.html
    // so the client-side router (useNavState) can read it. API/WS/media paths
    // still 404 normally.
    app.setNotFoundHandler((req, reply) => {
      // Non-GET/HEAD requests for SPA paths are almost always bugs (browsers
      // don't POST/PUT/DELETE to client-route URLs). Return real 404 so the
      // caller sees the misroute rather than a confusing 200 + index.html.
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        reply.code(404).send({ error: 'Not Found' });
        return;
      }
      const url = req.url;
      if (
        url.startsWith('/api') ||
        url.startsWith('/sitecore') ||
        url.startsWith('/ws') ||
        url.startsWith('/-/media') ||
        url.startsWith('/-/jssmedia')
      ) {
        reply.code(404).send({ error: 'Not Found' });
        return;
      }
      // Unknown GET/HEAD paths default to index.html so the client-side
      // router (useNavState) takes over. Add a prefix to the block-list
      // above if a future server-route namespace should stay opaque to the SPA.
      reply.sendFile('index.html');
    });
  }

  const { registerAdminLogsRoutes } = await import('./routes/admin-logs.js');
  await registerAdminLogsRoutes(app);

  app.addHook('onClose', async () => {
    await engine.close();
  });

  return { app, engine, speManager };
}
