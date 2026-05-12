import type { FastifyInstance } from 'fastify';
import { resolve, normalize, sep } from 'path';
import { existsSync } from 'fs';
import { discoverScsConfigs } from '../../engine/scs-config-detector.js';
import type { Engine } from '../../engine/index.js';

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
}
