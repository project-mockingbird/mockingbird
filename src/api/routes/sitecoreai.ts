import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import {
  listEnvironments, upsertEnvironment, deleteEnvironment, getResolvedEnvironment,
} from '../../engine/sitecoreai/environments.js';
import { createSitecoreAiClient } from '../../engine/sitecoreai/client.js';
import { previewInstall, executeInstall } from '../../engine/sitecoreai/install.js';
import { isConflictStrategy, type InstallProgress } from '../../engine/sitecoreai/types.js';
import type { CartSource } from '../../engine/package/types.js';

const SITECORE_ROOT_ID = '11111111-1111-1111-1111-111111111111';

interface InstallBody { envId?: string; sources?: CartSource[]; strategy?: string; }

export function registerSitecoreAiRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/api/sitecoreai/environments', async () => listEnvironments());

  app.put('/api/sitecoreai/environments/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const b = request.body as { name?: string; cmHost?: string; clientId?: string; clientSecret?: string; secretEnv?: string };
    if (!b?.name || !b.cmHost) return reply.status(400).send({ error: 'name, cmHost are required' });
    await upsertEnvironment({ id, name: b.name, cmHost: b.cmHost }, { clientId: b.clientId ?? '', clientSecret: b.clientSecret, secretEnv: b.secretEnv });
    return reply.status(204).send();
  });

  app.delete('/api/sitecoreai/environments/:id', async (request, reply) => {
    await deleteEnvironment((request.params as { id: string }).id);
    return reply.status(204).send();
  });

  app.post('/api/sitecoreai/environments/:id/test', async (request, reply) => {
    try {
      const env = await getResolvedEnvironment((request.params as { id: string }).id);
      const client = createSitecoreAiClient(env);
      await client.itemExists(SITECORE_ROOT_ID); // cheap authed round-trip; throws on auth/host failure
      return { ok: true };
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post('/api/sitecoreai/install/preview', async (request, reply) => {
    const b = request.body as InstallBody;
    if (!b?.envId || !isConflictStrategy(b.strategy)) return reply.status(400).send({ error: 'envId and a valid strategy are required' });

    // Stream NDJSON: per-item `progress` events while the planner probes each
    // item, then a terminal `plan` event (or `error`). Lets the UI show a real
    // "evaluating X of N" progress bar instead of an indeterminate spinner.
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
    const write = (o: unknown) => reply.raw.write(JSON.stringify(o) + '\n');

    try {
      const env = await getResolvedEnvironment(b.envId);
      const client = createSitecoreAiClient(env);
      const plan = await previewInstall(engine, b.sources ?? [], b.strategy, client, (completed, total) => write({ kind: 'progress', completed, total }));
      write({ kind: 'plan', plan });
    } catch (e) {
      write({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      reply.raw.end();
    }
  });

  app.post('/api/sitecoreai/install', async (request, reply) => {
    const b = request.body as InstallBody;
    if (!b?.envId || !isConflictStrategy(b.strategy)) return reply.status(400).send({ error: 'envId and a valid strategy are required' });

    // Take manual control of the socket for NDJSON streaming. Without hijack(),
    // Fastify would also try to send a reply after we write to reply.raw and
    // throw "Reply already sent".
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
    const write = (p: InstallProgress) => reply.raw.write(JSON.stringify(p) + '\n');

    const ac = new AbortController();
    request.raw.on('close', () => ac.abort()); // client disconnect cancels

    try {
      const env = await getResolvedEnvironment(b.envId);
      const client = createSitecoreAiClient(env);
      await executeInstall(engine, b.sources ?? [], b.strategy, client, { signal: ac.signal, onProgress: write });
    } catch (e) {
      write({ kind: 'error', completed: 0, total: 0, message: e instanceof Error ? e.message : String(e) });
    } finally {
      reply.raw.end();
    }
  });
}
