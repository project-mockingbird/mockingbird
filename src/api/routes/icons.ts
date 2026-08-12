import type { FastifyInstance } from 'fastify';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, sep, extname } from 'path';

/** Canonical icon size the picker previews and writes. */
const ICON_SIZE = '32x32';

/** Curated Sitecore categories: key = physical folder, label = friendly name,
 * in Sitecore's Change Icon dropdown order. Verify against the decompiled
 * SelectIcon source; folder names come from the baked Themes/Standard set. */
const ICON_CATEGORIES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'Applications', label: 'Applications' },
  { key: 'Apps', label: 'Apps' },
  { key: 'Business', label: 'Business' },
  { key: 'Control', label: 'Controls' },
  { key: 'Core', label: 'Core 1' },
  { key: 'Core2', label: 'Core 2' },
  { key: 'Core3', label: 'Core 3' },
  { key: 'Database', label: 'Database' },
  { key: 'Flags', label: 'Flags' },
  { key: 'Imaging', label: 'Imaging' },
  { key: 'LaunchPadIcons', label: 'LaunchPad Icons' },
  { key: 'Multimedia', label: 'Multimedia' },
  { key: 'Network', label: 'Network' },
  { key: 'Office', label: 'Office' },
  { key: 'OfficeWhite', label: 'Office White' },
  { key: 'Other', label: 'Other' },
  { key: 'People', label: 'People' },
  { key: 'Software', label: 'Software' },
  { key: 'WordProcessing', label: 'Word Processing' },
];

/** Actual (cased) relative path -> [folderLower, sizeLower]. Only 3+ segment
 * `Folder/Size/name.ext` paths qualify. */
function iconParts(actual: string): { folder: string; size: string } | null {
  const parts = actual.split('/');
  if (parts.length < 3) return null;
  return { folder: parts[0].toLowerCase(), size: parts[1].toLowerCase() };
}

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

  app.get('/api/icons/categories', async (_request, reply) => {
    if (!(await iconsEnabled())) {
      return reply.status(404).send({ error: 'icons not available', statusCode: 404 });
    }
    const manifest = await getManifest(iconRoot());
    const present = new Set<string>();
    for (const actual of manifest.values()) {
      const p = iconParts(actual);
      if (p && p.size === ICON_SIZE) present.add(p.folder);
    }
    const cats = ICON_CATEGORIES.filter((c) => present.has(c.key.toLowerCase()));
    return [...cats, { key: '*', label: 'All icons' }];
  });

  app.get('/api/icons', async (request, reply) => {
    if (!(await iconsEnabled())) {
      return reply.status(404).send({ error: 'icons not available', statusCode: 404 });
    }
    const category = (request.query as Record<string, string>)?.category ?? '';
    if (!category) {
      return reply.status(400).send({ error: 'category is required', statusCode: 400 });
    }
    const wantFolder = category === '*' ? null : category.toLowerCase();
    const manifest = await getManifest(iconRoot());
    const out: string[] = [];
    for (const actual of manifest.values()) {
      const p = iconParts(actual);
      if (!p || p.size !== ICON_SIZE) continue;
      if (wantFolder === null || p.folder === wantFolder) out.push(actual);
    }
    out.sort((a, b) => a.localeCompare(b));
    return out;
  });
}
