import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { resolveWorkspacePath, getWorkspaceRoot } from '../state/workspace-path.js';
import type { Engine } from '../../engine/index.js';
import { computeProjectHash } from '../project-hash.js';
import { readConfig, writeConfig, resolveConfigPath } from '../state/config-store.js';
import { DEFAULT_LAYER_COLOR } from '../constants.js';

/**
 * Merges user layers with layer stats and appends the synthetic ootb row when
 * the registry is loaded. Used by the open and status routes.
 */
export function layersWithEffectiveCount(
  engine: Engine,
): Array<{ name: string; sitecoreJsonPath?: string; color?: string; effectiveCount: number }> {
  const userLayers = engine.getLayers();
  const stats = engine.getLayerStats();
  const statsByName = new Map(stats.map((s) => [s.name, s.effectiveCount]));
  const result: Array<{ name: string; sitecoreJsonPath?: string; color?: string; effectiveCount: number }> =
    userLayers.map((l) => ({
      ...l,
      effectiveCount: statsByName.get(l.name) ?? 0,
    }));
  if (statsByName.has('ootb')) {
    result.push({ name: 'ootb', effectiveCount: statsByName.get('ootb')! });
  }
  return result;
}

export function registerProjectsRoutes(app: FastifyInstance, engine: Engine): void {
  const workspaceRoot = resolve(getWorkspaceRoot());

  /**
   * Opens a workspace by activating the given layers. Each layer's
   * sitecoreJsonPath is workspace-relative and path-jailed.
   *
   * State is held client-side (localStorage); the server only carries the
   * in-memory engine state for the duration of the session.
   */
  app.post<{
    Body: {
      layers?: Array<{
        sitecoreJsonPath?: string;
        name?: string;
        color?: string;
      }>;
      projectName?: string;
    };
  }>('/api/projects/open', async (req, reply) => {
    const layers = req.body?.layers;
    if (!Array.isArray(layers) || layers.length === 0) {
      reply.code(400).send({ error: 'body.layers must be a non-empty array' });
      return;
    }

    const resolved = [];
    const requestedPaths: string[] = [];
    for (const layer of layers) {
      if (typeof layer.sitecoreJsonPath !== 'string' || typeof layer.name !== 'string') {
        reply.code(400).send({ error: 'each layer must have sitecoreJsonPath and name strings' });
        return;
      }
      const absolute = resolveWorkspacePath(workspaceRoot, layer.sitecoreJsonPath);
      if (absolute === null) {
        reply.code(400).send({ error: `layer path "${layer.sitecoreJsonPath}" escapes workspace root` });
        return;
      }
      resolved.push({
        sitecoreJsonPath: absolute,
        name: layer.name,
        color: layer.color,
      });
      requestedPaths.push(layer.sitecoreJsonPath);
    }

    const projectName = typeof req.body?.projectName === 'string' ? req.body.projectName : undefined;
    try {
      await engine.openWorkspace(resolved, { projectName });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/'ootb' is reserved/.test(message)) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
    }

    // The schema generator is gated on a non-empty item tree, but at server
    // boot the multi-layer flow settles readiness on 'no-project' before any
    // project is loaded, so the readiness-driven trigger fires once with an
    // empty tree and never re-runs. Trigger it here now that openWorkspace
    // has populated the tree. Idempotent - bails if already extended.
    app.extendMockingbirdSchema?.();

    // Persist lastOpenedHash + bump lastOpenedAt on the project record. Best
    // effort: a failed write is logged but does not fail the open response.
    try {
      const hash = computeProjectHash(requestedPaths);
      const configPath = resolveConfigPath();
      const config = await readConfig(configPath);
      const now = Date.now();
      const existing = config.projects[hash];
      const savedLayers = layers.map((l) => ({
        sitecoreJsonPath: l.sitecoreJsonPath as string,
        name: l.name as string,
        color: l.color ?? DEFAULT_LAYER_COLOR,
      }));
      config.projects[hash] = {
        hash,
        name: projectName ?? existing?.name ?? hash,
        layers: savedLayers,
        createdAt: existing?.createdAt ?? now,
        lastOpenedAt: now,
      };
      config.lastOpenedHash = hash;
      await writeConfig(configPath, config);
    } catch (err) {
      app.log.warn({ err }, '[projects/open] failed to persist lastOpenedHash');
    }

    reply.send({ state: engine.readiness.state, layers: layersWithEffectiveCount(engine) });
  });

  /**
   * Tears down the current workspace and transitions the engine back to
   * no-project. Idempotent: calling on a no-project engine returns the same
   * shape without error.
   */
  app.post('/api/projects/close', async (_req, reply) => {
    await engine.closeWorkspace();

    // Best effort: clear lastOpenedHash so the next boot does not replay
    // the project the user just closed. Project records are preserved.
    try {
      const configPath = resolveConfigPath();
      const config = await readConfig(configPath);
      if (config.lastOpenedHash) {
        delete config.lastOpenedHash;
        await writeConfig(configPath, config);
      }
    } catch (err) {
      app.log.warn({ err }, '[projects/close] failed to clear lastOpenedHash');
    }

    reply.send({ state: engine.readiness.state, layers: [] });
  });
}
