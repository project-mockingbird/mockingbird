// src/web/components/detail/field-editors/renderings/serialize.ts

import type { ParsedLayout, RenderingCaching, RenderingEntry } from './types';
import { computeConditioning, decodeParams, encodeParams } from './utils';

const DEFAULT_DEVICE_ID = 'FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3';
const DEFAULT_DEVICE_OPEN = `<d id="{${DEFAULT_DEVICE_ID}}" p:p="1">`;
const DEFAULT_DEVICE_CLOSE = `</d>`;

function extractAttr(tag: string, name: string): string {
  // Matches name="value" or name='value' (whitespace-or-start prefixed).
  const re = new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`);
  const m = re.exec(tag);
  return m ? m[1] : '';
}

/**
 * Locate the Default device <d> block within the outer <r> wrapper.
 * Returns { startTag, body, endTag, blockStart, blockEnd } where blockStart/End
 * are character offsets into the original xml. Returns null if not found.
 */
function findDefaultDeviceBlock(xml: string): {
  startTag: string;
  body: string;
  endTag: string;
  blockStart: number;
  bodyStart: number;
  bodyEnd: number;
  blockEnd: number;
} | null {
  // Match the device block opening tag containing id="{DEFAULT_DEVICE_ID}".
  const escapedId = DEFAULT_DEVICE_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp(`<d[^>]*\\sid=["']\\{${escapedId}\\}["'][^>]*>`, 'i');
  const openMatch = openRe.exec(xml);
  if (!openMatch) return null;

  const blockStart = openMatch.index;
  const startTag = openMatch[0];
  const bodyStart = blockStart + startTag.length;

  // Find the matching </d> after bodyStart. We don't anticipate nested <d>
  // tags inside a device body in practice; if they appear in some content tree item,
  // a balanced-tag walk would be needed. v1 uses the first </d> after bodyStart.
  const endIdx = xml.indexOf('</d>', bodyStart);
  if (endIdx === -1) return null;
  const body = xml.slice(bodyStart, endIdx);
  const endTag = '</d>';
  const blockEnd = endIdx + endTag.length;

  return { startTag, body, endTag, blockStart, bodyStart, bodyEnd: endIdx, blockEnd };
}

const RENDERING_RE = /<r\s([^>]*?uid=[^>]*?)(?:\/>|>([\s\S]*?)<\/r>)/g;

function extractRlsRaw(body: string): string | undefined {
  const m = /<rls\b[\s\S]*?<\/rls>/i.exec(body);
  return m ? m[0] : undefined;
}

const CACHING_BOOL_ATTRS: Array<[string, keyof Omit<RenderingCaching, 'clearingBehavior'>]> = [
  ['cac', 'cacheable'],
  ['vbd', 'varyByData'],
  ['vbl', 'varyByLogin'],
  ['vbp', 'varyByParm'],
  ['vbqs', 'varyByQueryString'],
  ['vbu', 'varyByUser'],
  ['ciu', 'clearOnIndexUpdate'],
];

/**
 * Parse the 8 caching attrs (cac/vbd/vbl/vbp/vbqs/vbu/ciu/ccb) from a <r>
 * element's attribute string. Booleans normalize "1"/"true" -> true,
 * "0"/"false" -> false. Returns undefined when no caching attrs present.
 */
function extractCaching(attrs: string): RenderingCaching | undefined {
  const out: RenderingCaching = {};
  let any = false;
  for (const [attr, key] of CACHING_BOOL_ATTRS) {
    const raw = extractAttr(attrs, attr);
    if (raw === '') continue;
    out[key] = raw === '1' || raw.toLowerCase() === 'true';
    any = true;
  }
  const ccb = extractAttr(attrs, 'ccb');
  if (ccb !== '') {
    out.clearingBehavior = ccb;
    any = true;
  }
  return any ? out : undefined;
}

const KNOWN_ATTRS = new Set<string>([
  'uid',
  'p:before',
  'p:after',
  's:id',
  's:ph',
  's:ds',
  's:par',
  'cac', 'vbd', 'vbl', 'vbp', 'vbqs', 'vbu', 'ciu', 'ccb',
]);

const ATTR_RE = /(?:^|\s)([a-zA-Z_][\w:.-]*)=["']([^"']*)["']/g;

/**
 * Walk all attrs on the <r> element and return any not in KNOWN_ATTRS as a
 * raw string map. Used for round-trip preservation of cnd/pt/mvt and any
 * future Sitecore additions we don't model.
 */
function extractUnknownAttrs(attrs: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  let any = false;
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(attrs)) !== null) {
    const name = m[1];
    if (KNOWN_ATTRS.has(name)) continue;
    out[name] = m[2];
    any = true;
  }
  return any ? out : undefined;
}

export function parseLayoutXml(xml: string): ParsedLayout {
  if (!xml) return { entries: [], originalXml: '' };

  const block = findDefaultDeviceBlock(xml);
  if (!block) return { entries: [], originalXml: xml };

  const entries: RenderingEntry[] = [];
  RENDERING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RENDERING_RE.exec(block.body)) !== null) {
    const attrs = m[1];
    const body = m[2];

    const uid = extractAttr(attrs, 'uid');
    const renderingId = extractAttr(attrs, 's:id');
    const placeholder = extractAttr(attrs, 's:ph');
    const dataSource = extractAttr(attrs, 's:ds');
    const rawPar = extractAttr(attrs, 's:par');
    const rlsRaw = body !== undefined ? extractRlsRaw(body) : undefined;
    const caching = extractCaching(attrs);
    const unknownAttrs = extractUnknownAttrs(attrs);

    const entry: RenderingEntry = {
      uid: uid.toUpperCase(),
      renderingId: renderingId.toUpperCase(),
      placeholder,
      dataSource,
      params: decodeParams(rawPar),
    };
    if (rlsRaw) entry.rlsRaw = rlsRaw;
    if (caching) entry.caching = caching;
    if (unknownAttrs) entry.unknownAttrs = unknownAttrs;
    entries.push(entry);
  }

  return { entries, originalXml: xml };
}

/**
 * XML attribute-value escape: & -> &amp;, < -> &lt;, " -> &quot;.
 * Applied to s:ds, s:par, s:ph values when writing the attribute.
 * (uid and s:id are GUIDs - already safe.)
 */
function xmlAttrEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a single RenderingEntry as its <r .../> form, with conditioning attrs.
 * Self-closing when no rlsRaw; full-form (<r ...>...</r>) when rlsRaw present.
 *
 * Canonical attribute order: uid, p:before|p:after, s:ds, s:id, s:par, s:ph.
 */
function renderEntry(entry: RenderingEntry, conditioning: { pBefore?: string; pAfter?: string }): string {
  const parts: string[] = [`<r uid="${entry.uid}"`];
  if (conditioning.pBefore) parts.push(`p:before="${xmlAttrEscape(conditioning.pBefore)}"`);
  if (conditioning.pAfter) parts.push(`p:after="${xmlAttrEscape(conditioning.pAfter)}"`);
  // s:ds always emitted (Sitecore's serializer does so even when empty).
  parts.push(`s:ds="${xmlAttrEscape(entry.dataSource)}"`);
  parts.push(`s:id="${entry.renderingId}"`);
  const paramStr = encodeParams(entry.params);
  parts.push(`s:par="${xmlAttrEscape(paramStr)}"`);
  parts.push(`s:ph="${xmlAttrEscape(entry.placeholder)}"`);

  if (entry.caching) {
    const c = entry.caching;
    const boolAttr = (name: string, v: boolean | undefined) => {
      if (v === undefined) return;
      parts.push(`${name}="${v ? '1' : '0'}"`);
    };
    boolAttr('cac', c.cacheable);
    boolAttr('vbd', c.varyByData);
    boolAttr('vbl', c.varyByLogin);
    boolAttr('vbp', c.varyByParm);
    boolAttr('vbqs', c.varyByQueryString);
    boolAttr('vbu', c.varyByUser);
    boolAttr('ciu', c.clearOnIndexUpdate);
    if (c.clearingBehavior !== undefined) {
      parts.push(`ccb="${xmlAttrEscape(c.clearingBehavior)}"`);
    }
  }

  if (entry.unknownAttrs) {
    for (const [name, value] of Object.entries(entry.unknownAttrs)) {
      parts.push(`${name}="${xmlAttrEscape(value)}"`);
    }
  }

  const head = parts.join(' ');
  if (entry.rlsRaw) {
    return `${head}>${entry.rlsRaw}</r>`;
  }
  return `${head} />`;
}

/**
 * Serialize a layout from the in-memory entries plus the original XML.
 *
 * Strategy:
 *   - When originalXml is empty: emit a complete fresh wrapper containing only
 *     the Default-device block.
 *   - When originalXml has a Default-device block: splice the new device body
 *     into that block's position, preserving everything outside the body
 *     (outer <r> wrapper, non-Default <d> blocks, comments, whitespace) byte-for-byte.
 *   - When originalXml exists but has no Default-device block: insert a fresh
 *     Default-device block immediately after the outer <r> opening tag.
 *
 * Per the spec ("Whitespace tolerance on input ... canonical multiline form on
 * output"), the new Default-device body is emitted with one <r> per line plus
 * 4-space indentation matching Sitecore's serializer. Non-Default blocks keep
 * whatever whitespace was in originalXml.
 */
export function serializeLayoutXml(parsed: ParsedLayout, entries: RenderingEntry[]): string {
  const conditioning = computeConditioning(entries);
  const renderings = entries.map((e, i) => '    ' + renderEntry(e, conditioning[i])).join('\n');
  const newDeviceBody = renderings ? `\n${renderings}\n  ` : '';

  if (!parsed.originalXml) {
    // Fresh layout: minimal wrapper with the Default device block.
    return `<r xmlns:p="p" xmlns:s="s">\n  ${DEFAULT_DEVICE_OPEN}${newDeviceBody}${DEFAULT_DEVICE_CLOSE}\n</r>`;
  }

  const block = findDefaultDeviceBlock(parsed.originalXml);
  if (!block) {
    // originalXml exists but no Default device block - insert one after outer <r>.
    const outerOpenMatch = /<r\b[^>]*>/.exec(parsed.originalXml);
    if (!outerOpenMatch) {
      // Pathological - originalXml has no outer wrapper. Treat as fresh.
      return `<r xmlns:p="p" xmlns:s="s">\n  ${DEFAULT_DEVICE_OPEN}${newDeviceBody}${DEFAULT_DEVICE_CLOSE}\n</r>`;
    }
    const insertAt = outerOpenMatch.index + outerOpenMatch[0].length;
    return (
      parsed.originalXml.slice(0, insertAt) +
      `\n  ${DEFAULT_DEVICE_OPEN}${newDeviceBody}${DEFAULT_DEVICE_CLOSE}` +
      parsed.originalXml.slice(insertAt)
    );
  }

  // Splice new body into existing Default device block.
  return (
    parsed.originalXml.slice(0, block.bodyStart) +
    newDeviceBody +
    parsed.originalXml.slice(block.bodyEnd)
  );
}
