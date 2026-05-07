export const MEDIA_LIBRARY_PATH_PREFIX = '/sitecore/media library';

// Field ids on media-library items. Verified against a real Sitecore content tree.
export const WIDTH_FIELD_ID = '22eac599-f13b-4607-a89d-c091763a467d';
export const HEIGHT_FIELD_ID = 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a';
export const ALT_FIELD_ID = '65885c44-8fcd-4a7f-94f1-ee63703fe193';
export const EXTENSION_FIELD_ID = 'c06867fe-9a43-4c7d-b739-48780492d06f';

export interface ParsedImage {
  mediaid: string;
  alt?: string;
  width?: string;
  height?: string;
  hspace?: string;
  vspace?: string;
  cssClass?: string;
  border?: string;
}

function normaliseMediaId(raw: string): string {
  return raw.replace(/[{}]/g, '').toLowerCase();
}

function readAttr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : undefined;
}

export function parseImageXml(value: string): ParsedImage | null {
  if (!value || !value.trim()) return null;
  // Lenient on > inside attribute values (none seen in Sitecore-authored Image XML).
  const tag = value.match(/<image\b([^>]*?)\/?>/i);
  if (!tag) return null;
  const attrs = tag[1];
  const mediaid = readAttr(attrs, 'mediaid');
  if (!mediaid) return null;
  const out: ParsedImage = { mediaid: normaliseMediaId(mediaid) };
  const alt = readAttr(attrs, 'alt');
  if (alt !== undefined) out.alt = alt;
  const width = readAttr(attrs, 'width');
  if (width !== undefined) out.width = width;
  const height = readAttr(attrs, 'height');
  if (height !== undefined) out.height = height;
  const hspace = readAttr(attrs, 'hspace');
  if (hspace !== undefined) out.hspace = hspace;
  const vspace = readAttr(attrs, 'vspace');
  if (vspace !== undefined) out.vspace = vspace;
  const cssClass = readAttr(attrs, 'class');
  if (cssClass !== undefined) out.cssClass = cssClass;
  const border = readAttr(attrs, 'border');
  if (border !== undefined) out.border = border;
  return out;
}

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function serializeImageXml(parsed: ParsedImage): string {
  const pairs: Array<[string, string]> = [];
  pairs.push(['mediaid', parsed.mediaid]);
  // Alphabetical-by-XML-attr-name for the rest. cssClass maps to class.
  const rest: Array<[string, string | undefined]> = [
    ['alt', parsed.alt],
    ['border', parsed.border],
    ['class', parsed.cssClass],
    ['height', parsed.height],
    ['hspace', parsed.hspace],
    ['vspace', parsed.vspace],
    ['width', parsed.width],
  ];
  for (const [k, v] of rest) {
    if (v !== undefined && v !== '') pairs.push([k, v]);
  }
  return `<image ${pairs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')} />`;
}

/**
 * Mirror of `src/engine/render-field/media.ts` `buildMediaUrlPath`. Path-based
 * URL when the item is under /sitecore/media library, GUID-form fallback
 * otherwise. Spaces in the path become hyphens to match Sitecore's URL-safe
 * normalisation.
 */
export function buildMediaUrl(itemPath: string, itemId: string, ext: string | undefined): string {
  const extSuffix = `.${ext || 'ashx'}`;
  const lowerPath = itemPath.toLowerCase();
  if (lowerPath.startsWith(MEDIA_LIBRARY_PATH_PREFIX)) {
    const after = itemPath.slice(MEDIA_LIBRARY_PATH_PREFIX.length).replace(/ /g, '-');
    return `/-/media${after}${extSuffix}`;
  }
  const bareId = itemId.toUpperCase().replace(/-/g, '');
  return `/-/media/${bareId}${extSuffix}`;
}
