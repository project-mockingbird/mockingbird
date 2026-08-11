/**
 * Classify an item's `__Icon` value and, when it is a usable Sitecore sprite
 * path, return the URL that serves it (`GET /api/icon/...`). Returns null for
 * anything that is not an offline-resolvable sprite: empty, an external URL, or
 * a media-library / CM-handler reference (those need a running CM). Permissive
 * by design - anything plausibly a sprite is attempted; a 404 falls back to the
 * type-based icon at the call site.
 */
const NON_SPRITE_PREFIXES = ['-/media', '~/media', '/-/media', '/~/media', '/sitecore/shell/radcontrols'];

export function spriteIconSrc(icon: string | undefined | null): string | null {
  if (!icon) return null;
  let v = icon.trim();
  if (v === '') return null;
  if (/^https?:\/\//i.test(v)) return null;
  const lower = v.toLowerCase();
  if (NON_SPRITE_PREFIXES.some((p) => lower.startsWith(p))) return null;
  v = v.replace(/^([~-])\/icon\//i, '').replace(/^\/+/, '');
  if (v === '') return null;
  return `/api/icon/${v.split('/').map(encodeURIComponent).join('/')}`;
}
