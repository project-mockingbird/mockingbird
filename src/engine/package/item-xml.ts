// src/engine/package/item-xml.ts
//
// Item-version XML emitter. Produces the bytes that go into the
// `items/<db>/<path>/<id>/<lang>/<ver>/xml` zip entry of a classic Sitecore
// .zip package.
//
// Format authority:
//   - Emitter:  Sitecore.Data.Items.ItemSerializer.GetVersionXml
//               + the Nexus-side navigator that writes the actual element bytes
//   - Parser:   Sitecore.Install.Utils.XmlVersionParser
//               + Sitecore.Install.Items.ItemInstaller.ParseItemVersion / ParseField
//
// Empirical:  tests/fixtures/package/known-good/expected-inner/items/.../xml
//
// Notes on observed format details (from the empirical findings appendix):
//   - Single-line XML, no whitespace between elements, no XML declaration,
//     no BOM. UTF-8 raw bytes.
//   - `<item>` attribute order: name, key (lowercase name), id, tid, mid
//     (all-zero for non-branch), sortorder, language, version, template
//     (lowercase template name), parentid, created (Sitecore ISO
//     `yyyyMMddTHHmmssZ`).
//   - `<field>` attribute order: tfid (upper-braced GUID), key (lowercase
//     field name), type (the field-type label - emitted verbatim from the
//     template field's Type shared field).
//   - Empty fields render `<content />`; populated fields render
//     `<content>VALUE</content>` with XML-escaped value per
//     XmlTextWriter.WriteString semantics.
//   - The container holds EVERY field the template defines (including
//     inherited base-template fields), not just populated ones. Sitecore
//     Desktop's emission round-trips against `Template.GetFields()`.
//
// Field iteration order:
//   Sitecore Desktop emits fields in the order Sitecore's `item.Fields`
//   enumerates them, which is opaque from outside the kernel (effectively
//   storage order of the SQL field rows). This emitter uses
//   `getTemplateSchema(...)` natural order: sections sorted by sortOrder
//   then name, fields-within-section sorted likewise. Fixture round-trip
//   compares structurally on the field set rather than byte-for-byte on
//   field order.

import type { Engine } from '../index.js';
import type { ScsItem, ScsField } from '../types.js';
import { formatGuidBraced } from '../guid.js';
import { getTemplateSchema } from '../template-schema.js';
import { FIELD_IDS } from '../constants.js';

const ZERO_GUID = '{00000000-0000-0000-0000-000000000000}';
const DEFAULT_SORTORDER = '100';

export interface EmitItemXmlContext {
  /** Last path segment of the item, case-preserved. */
  itemName: string;
  /** Human-readable template name (lowercased into the `template` attribute). */
  templateName: string;
  /** Sitecore ISO format `yyyyMMddTHHmmssZ`. */
  createdIso: string;
  /** Database name. Defaults to `'master'` (only supported database in v1). */
  database?: 'master';
  /**
   * Per-field content overrides, keyed by lowercase field id. Used to inject
   * blob GUIDs into attachment fields: the item's stored value is the raw
   * base64 (or, after cache-stripping, absent), but the package XML must carry
   * the blob GUID that pairs with the `blob/{db}/{guid}` entry. When a field
   * id is present here, its value replaces whatever the item would otherwise
   * yield - including forcing an empty item value to render the GUID.
   */
  fieldOverrides?: Record<string, string>;
}

export interface VersionRef {
  language: string;
  version: number;
}

/**
 * Emit a single `<item>...</item>` XML document for one item-version.
 *
 * The template is walked via `getTemplateSchema` so every defined field
 * (including inherited base-template fields) is emitted - populated ones
 * with their value, unpopulated ones as `<content />`. This matches
 * Sitecore Desktop's emission, which lists every field on the item's
 * template regardless of whether it carries a value on this version.
 */
export function emitItemXml(
  engine: Engine,
  item: ScsItem,
  versionRef: VersionRef,
  ctx: EmitItemXmlContext,
): string {
  const out: string[] = [];
  out.push('<item');

  const sortorderAttr = readSortorder(item);
  const itemAttrs: Array<[string, string]> = [
    ['name', xmlAttrEscape(ctx.itemName)],
    ['key', xmlAttrEscape(ctx.itemName.toLowerCase())],
    ['id', formatGuidBraced(item.id)],
    ['tid', formatGuidBraced(item.template)],
    ['mid', item.branchId ? formatGuidBraced(item.branchId) : ZERO_GUID],
    ['sortorder', sortorderAttr],
    ['language', xmlAttrEscape(versionRef.language)],
    ['version', String(versionRef.version)],
    ['template', xmlAttrEscape(ctx.templateName.toLowerCase())],
    ['parentid', formatGuidBraced(item.parent)],
    ['created', xmlAttrEscape(ctx.createdIso)],
  ];
  for (const [k, v] of itemAttrs) {
    out.push(` ${k}="${v}"`);
  }
  out.push('>');

  // <fields> container. Emit ONLY the fields the item actually stores for this
  // (language, version) - shared, then unversioned, then versioned - which is
  // what real Sitecore serializes (an item's stored field rows, not the full
  // template schema). The schema is consulted only to resolve each field's
  // name + type. Fields injected via fieldOverrides (e.g. a Blob stripped from
  // the in-memory index) are appended even when the item does not carry them.
  out.push('<fields>');

  const meta = buildFieldMeta(item.template, engine);
  const language = versionRef.language;
  const versionNumber = versionRef.version;

  // Normalize override keys to lowercase so lookups are case-insensitive.
  const overrides: Record<string, string> | undefined = ctx.fieldOverrides
    ? Object.fromEntries(Object.entries(ctx.fieldOverrides).map(([k, v]) => [k.toLowerCase(), v]))
    : undefined;

  const stored = new Map<string, { hint: string; value: string }>();
  const collect = (fields: ScsField[]): void => {
    for (const f of fields) {
      const id = f.id.toLowerCase();
      if (!stored.has(id)) stored.set(id, { hint: f.hint, value: f.value });
    }
  };
  collect(item.sharedFields);
  const lang = item.languages.find(l => l.language === language);
  if (lang) {
    collect(lang.fields);
    const ver = lang.versions.find(v => v.version === versionNumber);
    if (ver) collect(ver.fields);
  }
  if (overrides) {
    for (const id of Object.keys(overrides)) {
      if (!stored.has(id)) stored.set(id, { hint: '', value: '' });
    }
  }

  for (const [id, field] of stored) {
    const m = meta.get(id);
    const name = (m?.name ?? field.hint ?? '').toLowerCase();
    const type = m?.type ?? '';
    const override = overrides?.[id];
    const value = override !== undefined ? override : field.value;
    out.push(renderField(id, name, type, value));
  }

  out.push('</fields>');
  out.push('</item>');
  return out.join('');
}

/**
 * Build a `fieldId (lowercase) -> { name, type }` lookup from the item's
 * template schema, used to resolve the `key` (field name) and `type` attributes
 * for each emitted field.
 */
function buildFieldMeta(
  templateId: string,
  engine: Engine,
): Map<string, { name: string; type: string }> {
  const schema = getTemplateSchema(templateId, engine);
  const map = new Map<string, { name: string; type: string }>();
  for (const section of schema.sections) {
    for (const field of section.fields) {
      map.set(field.id.toLowerCase(), { name: field.name, type: field.type });
    }
  }
  return map;
}

/** Render a single `<field .../>` element from resolved id/name/type/value. */
function renderField(id: string, name: string, type: string, value: string): string {
  const tfid = formatGuidBraced(id);
  const headOpen = `<field tfid="${tfid}" key="${xmlAttrEscape(name)}" type="${xmlAttrEscape(type)}">`;
  if (value.length === 0) {
    return `${headOpen}<content /></field>`;
  }
  return `${headOpen}<content>${xmlTextEscape(value)}</content></field>`;
}

/** Read the `__Sortorder` shared field. Defaults to '100' when absent. */
function readSortorder(item: ScsItem): string {
  const f = item.sharedFields.find(sf => sf.id.toLowerCase() === FIELD_IDS.sortorder);
  if (!f || f.value === '') return DEFAULT_SORTORDER;
  return xmlAttrEscape(f.value);
}

// ---------------------------------------------------------------------------
// XML escaping (XmlTextWriter.WriteString / WriteAttributeString semantics)
// ---------------------------------------------------------------------------

/**
 * Escape a string for use as XML element text. Mirrors
 * `XmlTextWriter.WriteString`:
 *   - `&` -> `&amp;`, `<` -> `&lt;`, `>` -> `&gt;`
 *   - Control chars (other than tab, CR, LF) emitted as `&#xNN;`
 *   - `"` and `'` are NOT escaped in element text - that's `WriteAttributeString`
 *     territory only. Empirically confirmed against the fixture's Text
 *     field (rich-text content with embedded `style="..."` attributes
 *     left as literal quotes).
 */
export function xmlTextEscape(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x26: out += '&amp;'; break;     // &
      case 0x3C: out += '&lt;'; break;      // <
      case 0x3E: out += '&gt;'; break;      // >
      case 0x09: case 0x0A: case 0x0D:
        out += s[i];
        break;
      default:
        if (c < 0x20) {
          out += `&#x${c.toString(16).toUpperCase().padStart(2, '0')};`;
        } else {
          out += s[i];
        }
        break;
    }
  }
  return out;
}

/**
 * Escape for use as an XML attribute value. Mirrors
 * `XmlTextWriter.WriteAttributeString` which adds `&quot;` to the text
 * escape so the surrounding `"..."` always parses. `&apos;` is also added
 * because Sitecore Desktop's emission uses it for literal apostrophes
 * inside attribute values.
 */
function xmlAttrEscape(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x26: out += '&amp;'; break;
      case 0x3C: out += '&lt;'; break;
      case 0x3E: out += '&gt;'; break;
      case 0x22: out += '&quot;'; break;
      case 0x27: out += '&apos;'; break;
      case 0x09: case 0x0A: case 0x0D:
        out += s[i];
        break;
      default:
        if (c < 0x20) {
          out += `&#x${c.toString(16).toUpperCase().padStart(2, '0')};`;
        } else {
          out += s[i];
        }
        break;
    }
  }
  return out;
}
