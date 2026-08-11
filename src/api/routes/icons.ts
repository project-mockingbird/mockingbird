import type { FastifyInstance } from 'fastify';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, sep, extname } from 'path';

/** Absolute icon root: the baked Sitecore Themes/Standard sprite set. */
function iconRoot(): string {
  return resolve(process.env.MOCKINGBIRD_ICON_ROOT ?? 'data/sitecore-icons');
}

/** rootPath -> (lowercased relative path -> actual relative path). Built once
 * per root and cached; the baked set never changes at runtime. */
const manifests = new Map<string, Map<string, string>>();

async function walk(root: string, rel: string, out: Map<string, string>): Promise<void> {
  const dir = rel ? join(root, rel) : root;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(root, childRel, out);
    else if (e.isFile()) out.set(childRel.toLowerCase(), childRel);
  }
}

async function getManifest(root: string): Promise<Map<string, string>> {
  let m = manifests.get(root);
  if (m) return m;
  m = new Map();
  if (existsSync(root)) await walk(root, '', m);
  manifests.set(root, m);
  return m;
}

/** True when the icon switch is on AND a non-empty icon set is baked. */
export async function iconsEnabled(): Promise<boolean> {
  if (process.env.MOCKINGBIRD_ICONS !== '1') return false;
  const m = await getManifest(iconRoot());
  return m.size > 0;
}

function mimeFor(rel: string): string {
  switch (extname(rel).toLowerCase()) {
    case '.gif': return 'image/gif';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    default: return 'image/png';
  }
}

export function registerIconRoutes(app: FastifyInstance): void {
  app.get('/api/icon/*', async (request, reply) => {
    const root = iconRoot();
    if (!existsSync(root)) {
      return reply.status(404).send({ error: 'icons not available', statusCode: 404 });
    }
    let rel = (request.params as Record<string, string>)['*'] ?? '';
    try {
      rel = decodeURIComponent(rel);
    } catch {
      return reply.status(404).send({ error: 'bad icon path', statusCode: 404 });
    }
    rel = rel.replace(/\\/g, '/').replace(/^([~-])\/icon\//i, '').replace(/^\/+/, '');
    // Traversal guard: reject empty or ".." segments outright.
    if (rel === '' || rel.split('/').some((seg) => seg === '..' || seg === '')) {
      return reply.status(404).send({ error: 'icon not found', statusCode: 404 });
    }
    const manifest = await getManifest(root);
    const actual = manifest.get(rel.toLowerCase());
    if (!actual) {
      return reply.status(404).send({ error: `icon not found: ${rel}`, statusCode: 404 });
    }
    const abs = resolve(root, actual);
    // Defense-in-depth: the resolved path must stay under root.
    if (abs !== root && !abs.startsWith(root + sep)) {
      return reply.status(404).send({ error: 'icon not found', statusCode: 404 });
    }
    const buf = await readFile(abs);
    return reply
      .type(mimeFor(actual))
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(buf);
  });
}
