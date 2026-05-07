import { readFile } from 'fs/promises';
import type { ScsField, ScsItem, ScsLanguage, ScsVersion } from './types.js';

/**
 * SCS .yml reader. Bug-compatible port of Sitecore's YAML grammar as
 * implemented by `Sitecore.DevEx.Serialization.Client.YamlReader` (itself a
 * near-verbatim fork of `Rainbow.Storage.Yaml.YamlReader`).
 *
 * The SCS format is NOT spec-compliant YAML. The separator between a key's
 * colon and its value is always exactly ONE space; any further leading
 * whitespace is part of the scalar value. Spec-compliant parsers (including
 * the `yaml` npm package we previously used) fold that leading whitespace
 * per §7.3.3, which lost byte-parity against prod Edge for every field whose
 * authored string began with a space (~717 divergences observed in the
 * 0.3.1 parity diff).
 *
 * Rainbow reference — `Rainbow.Storage.Yaml.YamlReader.ReadMapInternal`
 * (line 455 of the decompiled source):
 *
 *   int num = text.IndexOf(':');
 *   int indent = GetIndent(text);
 *   string key = text.Substring(indent, num - indent);
 *   if (text.Length &lt; num + 2) return (key, "");
 *   string v = text.Substring(num + 2);               // LITERAL slice
 *   v = v == "|" ? ReadMultilineString(indent + 2) : Decode(v);
 *
 * We port that directly and layer the SCS document shape on top.
 */

export class NotAnItemDocumentError extends Error {
  constructor(public readonly firstKey: string) {
    super(`SCS document is not an Item (first top-level key: ${firstKey || '<empty>'})`);
    this.name = 'NotAnItemDocumentError';
  }
}

export async function parseItem(filePath: string): Promise<ScsItem> {
  const content = await readFile(filePath, 'utf-8');
  return parseItemFromString(content);
}

interface Token {
  indent: number;
  listMarker: boolean;
  key: string;
  rawValue: string;
  isBlock: boolean;
  lineIdx: number;
}

interface Cursor {
  lines: string[];
  i: number;
}

export function parseItemFromString(content: string): ScsItem {
  // Strip UTF-8 BOM if present — SCS writer emits it, `readFile(..., 'utf-8')`
  // preserves it in the string, `---` comparison fails without this.
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const lines = content.split(/\r?\n/);

  // First data line must be `---`.
  const cur: Cursor = { lines, i: 0 };
  skipNonData(cur);
  if (cur.i >= cur.lines.length || cur.lines[cur.i] !== '---') {
    throw new Error('Invalid SCS YAML: missing expected --- header');
  }
  cur.i++;

  const item: ScsItem = {
    id: '', parent: '', template: '', path: '',
    sharedFields: [], languages: [],
  };

  let firstTopKey: string | undefined;
  while (true) {
    const tok = peekToken(cur);
    if (!tok || tok.indent !== 0) break;
    if (firstTopKey === undefined) firstTopKey = tok.key;
    consume(cur, tok);
    if (tok.key === 'SharedFields') {
      item.sharedFields = readFieldList(cur, /*minIndent*/ 1);
    } else if (tok.key === 'Languages') {
      item.languages = readLanguageList(cur, /*minIndent*/ 1);
    } else {
      const scalar = readScalar(cur, tok);
      switch (tok.key) {
        case 'ID': item.id = normalizeGuid(scalar); break;
        case 'Parent': item.parent = normalizeGuid(scalar); break;
        case 'Template': item.template = normalizeGuid(scalar); break;
        case 'Path': item.path = scalar; break;
        case 'BranchID': item.branchId = normalizeGuid(scalar); break;
        // DB and any unknown top-level keys are ignored.
      }
    }
  }

  if (!item.id) {
    throw new NotAnItemDocumentError(firstTopKey ?? '');
  }
  return item;
}

/**
 * Read a list of field records (ID / Hint / Type / BlobID / Value). The first
 * list-marker token seen at or above `minIndent` establishes the indent
 * level used for all subsequent items — this keeps the parser compatible
 * with both SCS/Rainbow output (list markers at column 0 directly under the
 * parent key) and the Mockingbird serializer's `yaml`-library default
 * (markers indented 2 under the parent). Rainbow's `GetIndent` counts both
 * ` ` and `-` as indent characters, so `- ID: …` and `  Hint: …` on the
 * following lines both report the same numeric indent; we distinguish a new
 * list item via the `listMarker` flag.
 */
function readFieldList(cur: Cursor, minIndent: number): ScsField[] {
  const out: ScsField[] = [];
  let listIndent: number | null = null;
  while (true) {
    const head = peekToken(cur);
    if (!head || !head.listMarker || head.key !== 'ID') break;
    if (head.indent < minIndent) break;
    if (listIndent === null) listIndent = head.indent;
    else if (head.indent !== listIndent) break;
    consume(cur, head);
    const field: ScsField = { id: normalizeGuid(readScalar(cur, head)), hint: '', value: '' };
    while (true) {
      const next = peekToken(cur);
      if (!next || next.indent !== listIndent || next.listMarker) break;
      consume(cur, next);
      const scalar = readScalar(cur, next);
      switch (next.key) {
        case 'Hint': field.hint = scalar; break;
        case 'Type': field.type = scalar; break;
        case 'Value': field.value = scalar; break;
        // BlobID and any other keys on a field record are ignored.
      }
    }
    out.push(field);
  }
  return out;
}

function readLanguageList(cur: Cursor, minIndent: number): ScsLanguage[] {
  const out: ScsLanguage[] = [];
  let listIndent: number | null = null;
  while (true) {
    const head = peekToken(cur);
    if (!head || !head.listMarker || head.key !== 'Language') break;
    if (head.indent < minIndent) break;
    if (listIndent === null) listIndent = head.indent;
    else if (head.indent !== listIndent) break;
    consume(cur, head);
    const lang: ScsLanguage = { language: readScalar(cur, head), fields: [], versions: [] };
    while (true) {
      const next = peekToken(cur);
      if (!next || next.indent !== listIndent || next.listMarker) break;
      consume(cur, next);
      if (next.key === 'Fields') {
        lang.fields = readFieldList(cur, listIndent + 1);
      } else if (next.key === 'Versions') {
        lang.versions = readVersionList(cur, listIndent + 1);
      }
      // Unknown keys on a language record are ignored.
    }
    out.push(lang);
  }
  return out;
}

function readVersionList(cur: Cursor, minIndent: number): ScsVersion[] {
  const out: ScsVersion[] = [];
  let listIndent: number | null = null;
  while (true) {
    const head = peekToken(cur);
    if (!head || !head.listMarker || head.key !== 'Version') break;
    if (head.indent < minIndent) break;
    if (listIndent === null) listIndent = head.indent;
    else if (head.indent !== listIndent) break;
    consume(cur, head);
    const version: ScsVersion = { version: Number(readScalar(cur, head)) || 0, fields: [] };
    while (true) {
      const next = peekToken(cur);
      if (!next || next.indent !== listIndent || next.listMarker) break;
      consume(cur, next);
      if (next.key === 'Fields') {
        version.fields = readFieldList(cur, listIndent + 1);
      }
    }
    out.push(version);
  }
  return out;
}

/** Interpret a token's scalar value: block-scalar body, quoted, or literal. */
function readScalar(cur: Cursor, tok: Token): string {
  if (tok.isBlock) return readBlockScalar(cur, tok.indent + 2);
  return decode(tok.rawValue);
}

/** Strip surrounding `"..."` and unescape `\"` → `"`. Plain scalars pass through verbatim. */
function decode(value: string): string {
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

/**
 * Read subsequent lines until one appears with indent &lt; the required
 * `indent`. Each retained line contributes `line.slice(indent)` — everything
 * to the left of `indent` is the block-scalar indent marker and discarded.
 *
 * Matches Rainbow's `ReadMultilineString(int indent)` (line 484 of the
 * decompile). We join with `\n` rather than `Environment.NewLine` so the
 * parsed string is deterministic across dev-OS and container-OS runs; prod
 * Edge is Linux, and SCS writers emit `\n` on Linux anyway.
 */
function readBlockScalar(cur: Cursor, indent: number): string {
  const out: string[] = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i];
    if (lineIndent(line) < indent) break;
    out.push(line.slice(indent));
    cur.i++;
  }
  return out.join('\n');
}

/**
 * Rainbow `GetIndent`: loop past leading ` ` or `-`; return the index at the
 * first non-indent char, OR `line.length` if every char is a space/dash.
 * A blank line therefore reports indent 0 — which breaks block-scalar
 * continuation as expected (SCS writers never emit blank lines inside a
 * block-scalar body, so this matches observed output).
 */
function lineIndent(line: string): number {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '-')) i++;
  return i;
}

/** Tokenise a single line. Returns `null` if the line has no colon. */
function tokenize(line: string, lineIdx: number): Token | null {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const indent = lineIndent(line);
  // List marker: the two chars immediately preceding the key are "- ". The
  // `indent` run has already consumed them.
  const listMarker = indent >= 2 && line[indent - 2] === '-' && line[indent - 1] === ' ';
  const key = line.slice(indent, colon);
  const rawValue = line.length < colon + 2 ? '' : line.slice(colon + 2);
  return { indent, listMarker, key, rawValue, isBlock: rawValue === '|', lineIdx };
}

/** Peek the next data line without consuming. Returns null at EOF. */
function peekToken(cur: Cursor): Token | null {
  let j = cur.i;
  while (j < cur.lines.length) {
    const line = cur.lines[j];
    if (line.trim() === '') { j++; continue; }
    const ind = lineIndent(line);
    if (ind < line.length && line[ind] === '#') { j++; continue; }
    const tok = tokenize(line, j);
    if (!tok) { j++; continue; }
    return tok;
  }
  return null;
}

function consume(cur: Cursor, tok: Token): void {
  cur.i = tok.lineIdx + 1;
}

/** Skip blank / comment lines at the cursor. */
function skipNonData(cur: Cursor): void {
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i];
    if (line.trim() === '') { cur.i++; continue; }
    const ind = lineIndent(line);
    if (ind < line.length && line[ind] === '#') { cur.i++; continue; }
    break;
  }
}

/**
 * Canonicalise any SCS-emitted GUID reference to bare-lowercase-dashed form.
 * Different SCS serializer variants store ids brace-wrapped (`{GUID}`) or
 * bare, uppercase or lowercase; mockingbird's tree keys every node by the
 * canonical form, so `item.parent` must match that exact shape or the
 * children index can't link the node. Historically this only lowercased,
 * which left brace-wrapped parent references as unresolved orphans.
 */
function normalizeGuid(guid: string | undefined): string {
  return (guid ?? '').replace(/[{}]/g, '').toLowerCase();
}
