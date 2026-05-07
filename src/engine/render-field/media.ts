import type { ScsItem } from '../types.js';
import { MEDIA_LIBRARY_PATH_PREFIX } from '../constants.js';

export const MEDIA_EXTENSION_FIELD_ID = 'c06867fe-9a43-4c7d-b739-48780492d06f';
export const MEDIA_WIDTH_FIELD_ID = '22eac599-f13b-4607-a89d-c091763a467d';
export const MEDIA_HEIGHT_FIELD_ID = 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a';
export const MEDIA_ALT_FIELD_ID = '65885c44-8fcd-4a7f-94f1-ee63703fe193';

/**
 * Read a shared field's trimmed string value, returning `""` when absent.
 * Scoped to this module — the per-type field renderers rely on it for
 * media-item field access (`Extension`, later `Width`/`Height`/`Alt`).
 */
export function readSharedString(item: ScsItem, fieldId: string): string {
  const f = item.sharedFields.find(fld => fld.id.toLowerCase() === fieldId);
  return f ? f.value.trim() : '';
}

/**
 * Build the Edge-shape media URL path segment for a media item. The sole
 * URL-path builder used by every media-URL call site in the engine — layout
 * field-formatter's image/link branches, render-field pipeline processors,
 * and the rich-text media-token rewriter.
 *
 * Returns the bare path form `/-/media/<path>.<ext>` — no host prefix, no
 * querystring. Callers that need a CDN-host-prefixed URL compose themselves:
 * `${mediaBaseUrl}${buildMediaUrlPath(item)}`.
 *
 * Sitecore-authentic semantics (ported in 0.4.0.10, items 2/3/5):
 * - Extension field value is emitted verbatim (no case transform). Matches
 *   `MediaItem.Extension` behavior.
 * - Empty Extension field → fallback to `ashx` (Sitecore's
 *   `Settings.Media.RequestExtension` default). Covers MediaFolder targets
 *   and author-misconfigured items.
 * - Non-media-library item → fall back to ID form
 *   `/-/media/{ID-UPPER-NODASH}.<ext>`. Sitecore's `MediaUrlBuilder` emits
 *   this when it can't build a path-based URL; Edge publish mirrors.
 *
 * Replaces 0.4.0.8-vintage parallel helpers `buildMediaBaseUrl` (was at
 * `layout/field-formatter.ts`) and `buildMediaSrc` (was at this file).
 */
export function buildMediaUrlPath(item: ScsItem): string {
  const ext = readSharedString(item, MEDIA_EXTENSION_FIELD_ID);
  // Sitecore's Settings.Media.RequestExtension default — applied when the
  // Extension field is empty. MediaFolders naturally have no Extension →
  // naturally get `.ashx`, matching Edge's observed emission. Also the
  // `.toLowerCase()` formerly applied here is dropped; `MediaItem.Extension`
  // returns the authored string verbatim (items 2 + 5 in the 0.4.0.10 spec).
  const extSuffix = `.${ext || 'ashx'}`;

  // Item not under /sitecore/media library → Sitecore's URL builder falls
  // back to the ID form. Guards against the blind-slice bug that produced
  // mangled output in the pre-0.4.0.10 `buildMediaBaseUrl` path (item 3 in
  // the 0.4.0.10 spec).
  if (!item.path.toLowerCase().startsWith(MEDIA_LIBRARY_PATH_PREFIX)) {
    const bareId = item.id.toUpperCase().replace(/-/g, '');
    return `/-/media/${bareId}${extSuffix}`;
  }

  // Space→hyphen matches Edge's URL-safe filename convention. Edge applies
  // the same normalization on the CDN side, so media items whose parent
  // folder names contain spaces still resolve.
  const pathAfterLib = item.path.slice(MEDIA_LIBRARY_PATH_PREFIX.length).replace(/ /g, '-');
  return `/-/media${pathAfterLib}${extSuffix}`;
}

/**
 * Read a media item's versioned `Alt` field. `Alt` is language/version-
 * scoped on Sitecore's Image template (unlike `Width`/`Height` which are
 * shared), so walk en's language fields first, then each version,
 * latest-first. Falls back to `""` when unset — matches
 * `FieldRenderer.RenderField`'s `<img alt="">` emission for images whose
 * media item carries no authored Alt.
 */
export function readMediaAlt(media: ScsItem): string {
  const lang = media.languages.find(l => l.language === 'en');
  if (!lang) return '';
  const fromLang = lang.fields.find(f => f.id.toLowerCase() === MEDIA_ALT_FIELD_ID)?.value;
  if (fromLang) return fromLang;
  const versions = lang.versions ?? [];
  for (let i = versions.length - 1; i >= 0; i--) {
    const hit = versions[i].fields.find(f => f.id.toLowerCase() === MEDIA_ALT_FIELD_ID)?.value;
    if (hit) return hit;
  }
  return '';
}

/**
 * Historical: Sitecore's `InternalLinkFieldSerializer.GetLinkUrl` excludes
 * `MediaFolder`-templated items from the media-URL resolver (see
 * decompile at `Sitecore.LayoutService.decompiled.cs:1740`). Retained
 * here for documentation + potential future callers; `isMediaItem` no
 * longer references it as of 0.4.0.9.
 */
export const MEDIA_FOLDER_TEMPLATE_ID = 'fe5dd826-48c6-436d-b87a-7c4210c7413b';

/**
 * Decide whether a resolved item should route through the media-URL
 * builder (CDN form) rather than the site-relative URL builder. Path-
 * prefix only — any item under `/sitecore/media library` qualifies,
 * including `MediaFolder`-templated folders.
 *
 * This diverges from Sitecore's LayoutService
 * `InternalLinkFieldSerializer.GetLinkUrl` dispatch (decompile at
 * `Sitecore.LayoutService.decompiled.cs:1740`), which excludes
 * `MediaFolder` and falls folders back to `BaseLinkManager.GetItemUrl`.
 * Edge publish's empirical behavior resolves folder targets to
 * `/-/media/<path>.ashx` anyway - verified against an internal-link
 * field whose target was a MediaFolder; Edge served the folder under
 * the `.ashx` extension. The predicate matches Edge's observed output;
 * the LayoutService source's exclusion is a non-Edge code path
 * (Experience Editor, MVC render).
 *
 * If a future content tree surfaces a MediaFolder target that should NOT
 * resolve to a CDN URL, the predicate can reinstate the exclusion
 * narrowed to that case.
 */
export function isMediaItem(item: ScsItem): boolean {
  return item.path.toLowerCase().startsWith(MEDIA_LIBRARY_PATH_PREFIX);
}

/**
 * Build the full Edge-shape `src` URL for a media item — `/-/media/<path>.<ext>?h=<h>&iar=0&w=<w>`.
 * The `iar=0` param is always emitted. Height and width are emitted only when
 * the authored XML or media item carries a non-empty value for the corresponding
 * field — matches prod Edge's `MediaUrlBuilder` behavior: SVGs and other assets
 * without stored dimensions produce just `?iar=0`.
 *
 * Two call sites share this helper:
 *   - `formatImage` in `src/engine/layout/field-formatter.ts` (layout-response path)
 *   - `renderImageStub` in `src/engine/render-field/processors/image-stub.ts`
 *     (render-field pipeline used by `buildJsonValue` and ComponentQuery-driven
 *     renderings like Spotlight and PersonList)
 *
 * Returned `width` / `height` reflect authored-wins-over-media resolution.
 * Callers that need the resolved dimensions for sibling output keys can use
 * them directly; callers that suppress the attr on authored-empty (like
 * `renderImageStub`) can discard them.
 */
export function buildMediaSrc(
  media: ScsItem,
  mediaBaseUrl: string,
  authoredWidth: string,
  authoredHeight: string,
): { src: string; width: string; height: string } {
  const width = authoredWidth || readSharedString(media, MEDIA_WIDTH_FIELD_ID);
  const height = authoredHeight || readSharedString(media, MEDIA_HEIGHT_FIELD_ID);
  const query: string[] = [];
  if (height) query.push(`h=${height}`);
  query.push('iar=0');
  if (width) query.push(`w=${width}`);
  return {
    src: `${mediaBaseUrl}${buildMediaUrlPath(media)}?${query.join('&')}`,
    width,
    height,
  };
}
