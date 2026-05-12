import type { FastifyInstance } from 'fastify';
import { resolve, normalize, sep } from 'path';
import { existsSync } from 'fs';
import { discoverScsConfigs } from '../../engine/scs-config-detector.js';
import type { Engine } from '../../engine/index.js';

/**
 * Merges user layers with layer stats and appends the synthetic ootb row when
 * the registry is loaded. Used by the open, close, and status routes so all
 * three return the same layers[] shape.
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

/**
 * Resolves a workspace-relative path to an absolute path inside the workspace
 * root, rejecting any escape attempt. Returns null on invalid input or escape.
 * Mirrors the path-jail logic from src/api/routes/fs.ts.
 */
function resolveWorkspacePath(workspaceRoot: string, requested: string): string | null {
  if (typeof requested !== 'string') return null;
  if (!requested.startsWith('/')) return null;
  const candidate = resolve(workspaceRoot, '.' + requested);
  const normalized = normalize(candidate);
  const rootWithSep = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep;
  if (normalized !== workspaceRoot && !normalized.startsWith(rootWithSep)) return null;
  return normalized;
}

export function registerProjectsRoutes(app: FastifyInstance, engine: Engine): void {
  const workspaceRoot = resolve(process.env.MOCKINGBIRD_WORKSPACE_ROOT ?? '/workspaces');

  /**
   * Scans a workspace-relative path for sitecore.json-shaped config files.
   * Returns candidates with moduleCount + pushOpsSummary per file.
   */
  app.post<{ Body: { path?: string } }>(
    '/api/projects/discover-layers',
    async (req, reply) => {
      const requested = req.body?.path;
      if (typeof requested !== 'string') {
        reply.code(400).send({ error: 'body.path is required' });
        return;
      }
      const absolute = resolveWorkspacePath(workspaceRoot, requested);
      if (absolute === null) {
        reply.code(400).send({ error: 'path escapes workspace root or is invalid' });
        return;
      }
      if (!existsSync(absolute)) {
        reply.code(200).send({ candidates: [] });
        return;
      }
      const candidates = await discoverScsConfigs(absolute);
      reply.send({ candidates });
    },
  );

  /**
   * Opens a workspace by activating the given layers. Each layer's
   * sitecoreJsonPath is workspace-relative and path-jailed.
   */
  app.post<{
    Body: {
      layers?: Array<{
        sitecoreJsonPath?: string;
        name?: string;
        color?: string;
      }>;
    };
  }>('/api/projects/open', async (req, reply) => {
    const layers = req.body?.layers;
    if (!Array.isArray(layers) || layers.length === 0) {
      reply.code(400).send({ error: 'body.layers must be a non-empty array' });
      return;
    }

    const resolved = [];
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
    }

    try {
      await engine.openWorkspace(resolved);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/'ootb' is reserved/.test(message)) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
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
    reply.send({ state: engine.readiness.state, layers: layersWithEffectiveCount(engine) });
  });
}
