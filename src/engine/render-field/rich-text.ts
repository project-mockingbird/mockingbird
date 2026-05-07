import type { Engine } from '../index.js';
import { toCanonicalGuid } from '../guid.js';
import { buildMediaUrlPath } from './media.js';
import { referenceUrl } from '../layout/url-utils.js';
import { readFieldWithSvFallback } from '../layout/item-fields.js';

/** SXA `Value` shared/versioned field present on Content Token items. */
const XA_VARIABLE_VALUE_FIELD_ID = '09147fb2-ebfb-4949-8c8e-26a424409d5e';

/**
 * Regex matching `<span class="xa-variable" … data-variableid="{ID}">…</span>`.
 * Exported for use by the force-expansion opt-in path (see `expandXaVariableSpans`).
 */
const XA_VARIABLE_SPAN_RE =
  /<span\b[^>]*\bclass="[^"]*\bxa-variable\b[^"]*"[^>]*\bdata-variable(?:item)?id="(\{?[0-9a-fA-F-]{32,38}\}?)"[^>]*>[\s\S]*?<\/span>/gi;

/** True when `value` contains at least one SXA Content Token span. */
export function containsXaVariableSpan(value: string): boolean {
  if (!value) return false;
  // Reset lastIndex since the constant regex is /g — stateful across calls.
  XA_VARIABLE_SPAN_RE.lastIndex = 0;
  return XA_VARIABLE_SPAN_RE.test(value);
}

/**
 * Expand only SXA Content Token spans — no dynamic-link, no media, no CR
 * stripping. Used by the opt-in `MOCKINGBIRD_XA_VARIABLE_EXPANSION=force`
 * path so non-RichText-typed fields that carry xa-variable markup still
 * resolve their tokens, without applying the broader RichText rewrites
 * that could false-positive on plain-text content.
 *
 * Default behaviour (mode=`sitecore`) is still the Sitecore-contract type-
 * based dispatch — this function is strictly additive, called only when the
 * opt-in env var is set.
 */
export function expandXaVariableSpans(
  value: string,
  engine: Engine,
): string {
  if (!containsXaVariableSpan(value)) return value;
  return value.replace(XA_VARIABLE_SPAN_RE, (match, rawId) => {
    const id = toCanonicalGuid(rawId);
    if (!id) return match;
    const node = engine.getItemById(id);
    if (!node) return match;
    const tokenValue = readFieldWithSvFallback(engine, node.item, XA_VARIABLE_VALUE_FIELD_ID, 'en');
    return tokenValue ?? match;
  });
}

/**
 * Rewrite Sitecore's dynamic link/media tokens inside a Rich Text body —
 * the mockingbird port of `FieldRenderer.RenderField` under
 * `DynamicLinkDatabaseSwitcher(Context.Database)`:
 *
 *   `~/link.aspx?_id={GUID}[&_z=z][&...]`  → site-relative URL of the item
 *   `-/media/<32hex>.ashx[?querystring]`   → `/-/media/<path>.<ext>?<qs>`
 *
 * Both the layout-side (`field-formatter.ts`) and jsonValue-side
 * (`field-json-value.ts`) RichText paths run bodies through this rewriter
 * so ComponentQuery projections on `spotlightContent.jsonValue.value`
 * match the layout-side byte-for-byte.
 *
 * `mediaBaseUrl` is prepended to every resolved media URL - when empty
 * (the jsonValue path) the output is `/-/media/<path>.<ext>`, which a
 * client-side parity normalizer collapses to a CDN URL of the form
 * `https://<cdn>/-/media/<path>.<ext>?<cache-busters>`.
 */
export function rewriteRichText(
  value: string,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
): string {
  let out = value;

  out = out.replace(/~\/link\.aspx\?[^"'\s)]*/gi, (match) => {
    const idMatch = match.match(/_id=(\{?[0-9a-fA-F-]{32,38}\}?)/i);
    if (!idMatch) return match;
    const id = toCanonicalGuid(idMatch[1]);
    if (!id) return match;
    const node = engine.getItemById(id);
    if (node) return referenceUrl(node.item.path, siteRootPath);
    return formatLinkItemNotFoundUrl(id);
  });

  // 0.4.0.29 / 0.4.0.30: SXA Content Token span resolution.
  //   `<span class="xa-variable" ... data-variableid="{ID}">label</span>`
  // Prod Edge looks up the referenced token item and replaces the entire
  // span with the token's `Value` field. The inner "label" text is editor-
  // facing scaffolding (the resolved value on the published page). Missing
  // tokens pass through unchanged to avoid silent content loss.
  //
  // 0.4.0.30: attribute name is `data-variableid` (no "item" prefix). The
  // 0.4.0.29 regex was written against an initial spec of `data-variableitemid`
  // and did not fire on real-world site authoring. Accept both defensively;
  // matching both costs nothing and guards against SXA-version variance.
  // Reuses the same expander as the opt-in `MOCKINGBIRD_XA_VARIABLE_EXPANSION=force`
  // path (DRY — one regex, one resolver).
  out = expandXaVariableSpans(out, engine);

  out = out.replace(/-\/media\/([0-9a-fA-F]{32})\.ashx([^"'\s)]*)/gi, (_match, hex, query) => {
    const id = toCanonicalGuid(hex);
    if (!id) return _match;
    const node = engine.getItemById(id);
    if (!node) return _match;
    return `${mediaBaseUrl}${buildMediaUrlPath(node.item)}${query ?? ''}`;
  });

  // 0.4.0.10 item 9: strip bare `\r` (CR not followed by LF). Sitecore
  // does not emit standalone CRs; a typical client-side normalizer
  // already collapses `\r\n` -> `\n`, so `\r\n` pairs pass through
  // unchanged (handled by the negative lookahead `(?!\n)`).
  out = out.replace(/\r(?!\n)/g, '');

  return out;
}

/**
 * Format Sitecore's `notfound.aspx` fallback URL for unresolved
 * `~/link.aspx?_id={GUID}` tokens, mirroring the Kernel's
 * `DynamicLink.SetLinkItemNotFoundError` (decompile at
 * `Sitecore.Kernel.decompiled.cs:213076-213092`):
 *
 *   <Settings.LinkItemNotFoundUrl>?item=<database>:<id>@<language>
 *
 * For the reference content tree: database=`master`, id=`{UPPER-DASHED-GUID}`,
 * language=`en`. URL-encoded via `.NET`'s `HttpUtility.UrlEncode`
 * (lowercase-hex), matching prod's observed `%3a` / `%7b` / `%7d` / `%40`.
 *
 * Language is hardcoded `en` — the reference content tree is English-only and the
 * engine doesn't thread per-page language through this code path. If a
 * future content tree adds other languages, extend `rewriteRichText`'s
 * signature to accept language and thread it through.
 */
function formatLinkItemNotFoundUrl(canonicalId: string): string {
  const upperDashed = canonicalId.toUpperCase();
  return `/sitecore/service/notfound.aspx?item=master%3a%7b${upperDashed}%7d%40en`;
}
