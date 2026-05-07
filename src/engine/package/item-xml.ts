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
import { getTemplateSchema, type TemplateFieldSchema } from '../template-schema.js';
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

  // <fields> container. Walk the template schema to enumerate every defined
  // field (own + inherited).
  out.push('<fields>');

  const schema = getTemplateSchema(item.template, engine);
  const language = versionRef.language;
  const versionNumber = versionRef.version;

  for (const section of schema.sections) {
    for (const field of section.fields) {
      out.push(emitField(field, item, language, versionNumber));
    }
  }

  out.push('</fields>');
  out.push('</item>');
  return out.join('');
}

/**
 * Look up a field's value on the ScsItem according to its sharing kind:
 *   - shared:      look in item.sharedFields
 *   - unversioned: look in item.languages[L].fields
 *   - versioned:   look in item.languages[L].versions[V].fields
 *
 * Returns empty string when not present.
 */
function getFieldValue(
  field: TemplateFieldSchema,
  item: ScsItem,
  language: string,
  versionNumber: number,
): string {
  const fieldIdLc = field.id.toLowerCase();

  if (field.shared) {
    return findFieldValue(item.sharedFields, fieldIdLc);
  }

  const lang = item.languages.find(l => l.language === language);
  if (!lang) return '';

  if (field.unversioned) {
    return findFieldValue(lang.fields, fieldIdLc);
  }

  const ver = lang.versions.find(v => v.version === versionNumber);
  if (!ver) return '';
  return findFieldValue(ver.fields, fieldIdLc);
}

function findFieldValue(fields: ScsField[], fieldIdLc: string): string {
  for (const f of fields) {
    if (f.id.toLowerCase() === fieldIdLc) return f.value;
  }
  return '';
}

function emitField(
  field: TemplateFieldSchema,
  item: ScsItem,
  language: string,
  versionNumber: number,
): string {
  const tfid = formatGuidBraced(field.id);
  const key = xmlAttrEscape(field.name.toLowerCase());
  const type = xmlAttrEscape(field.type);
  const value = getFieldValue(field, item, language, versionNumber);

  const headOpen = `<field tfid="${tfid}" key="${key}" type="${type}">`;
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
