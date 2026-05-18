import type { ScsField, ScsItem, ScsLanguage, ScsVersion } from './types.js';
import { parseItemFromString } from './parser.js';

/**
 * SCS .yml writer. Inverse of parser.ts - emits bytes the parser reads
 * back to a structurally-identical ScsItem, matching the output format
 * of `Rainbow.Storage.Yaml.YamlWriter` byte-for-byte so round-trips
 * through the parser/serializer pair are stable and git diffs against
 * Rainbow-written SCS files are clean.
 *
 * Rainbow reference (decompile lines 612-625):
 *
 *   protected virtual void WriteMapInternal(string key, string value) {
 *       if (value.IndexOfAny(new char[4] {'\n','\r','"','\\'}) > -1) {
 *           _writer.WriteLine("{0}: |{1}{2}", key, NewLine,
 *               IndentMultilineString(Indent + 2, value));
 *           return;
 *       }
 *       _writer.WriteLine("{0}: {1}", key,
 *           (value.IndexOfAny(new char[9] {'"',':','[',']','{','}','!','?','-'}) > -1)
 *               ? Encode(value) : value);
 *   }
 *   protected virtual string Encode(string value) {
 *       return string.Format("\"{0}\"", value.Replace("\"", "\\\""));
 *   }
 *
 * Defaults match Windows-authored SCS files (via the dotnet sitecore
 * CLI): UTF-8 BOM + CRLF line endings. Callers can override via
 * `SerializeOptions` for LF-only environments.
 */

export interface SerializeOptions {
  /** Prepend a UTF-8 BOM. Default: true. */
  bom?: boolean;
  /** Line ending sequence. Default: '\r\n'. */
  newline?: '\n' | '\r\n';
}

const DEFAULT_OPTIONS: Required<SerializeOptions> = { bom: true, newline: '\r\n' };

export function serializeItem(item: ScsItem, options: SerializeOptions = {}): string {
  const { bom, newline } = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];
  lines.push('---');
  writeMap(lines, 'ID', item.id, 0);
  writeMap(lines, 'Parent', item.parent, 0);
  writeMap(lines, 'Template', item.template, 0);
  writeMap(lines, 'Path', item.path, 0);
  if (item.branchId) writeMap(lines, 'BranchID', item.branchId, 0);

  if (item.sharedFields.length > 0) {
    lines.push('SharedFields:');
    writeFieldList(lines, item.sharedFields, 0);
  }

  if (item.languages.length > 0) {
    lines.push('Languages:');
    writeLanguageList(lines, item.languages);
  }

  const body = lines.join(newline) + newline;
  return bom ? '﻿' + body : body;
}

/**
 * Write each field as a list entry. The `-` of the list marker sits at
 * column `listCol`; sibling keys (`Hint`, `Type`, `Value`) align with
 * the list entry's key column at `listCol + 2`.
 */
function writeFieldList(lines: string[], fields: ScsField[], listCol: number): void {
  const siblingCol = listCol + 2;
  for (const field of fields) {
    writeMap(lines, 'ID', field.id, listCol, true);
    writeMap(lines, 'Hint', field.hint, siblingCol);
    if (field.type !== undefined) writeMap(lines, 'Type', field.type, siblingCol);
    writeMap(lines, 'Value', field.value, siblingCol);
  }
}

function writeLanguageList(lines: string[], languages: ScsLanguage[]): void {
  for (const lang of languages) {
    writeMap(lines, 'Language', lang.language, 0, true);
    if (lang.fields.length > 0) {
      lines.push('  Fields:');
      writeFieldList(lines, lang.fields, 2);
    }
    if (lang.versions.length > 0) {
      lines.push('  Versions:');
      writeVersionList(lines, lang.versions);
    }
  }
}

function writeVersionList(lines: string[], versions: ScsVersion[]): void {
  for (const version of versions) {
    writeMap(lines, 'Version', String(version.version), 2, true);
    if (version.fields.length > 0) {
      lines.push('    Fields:');
      writeFieldList(lines, version.fields, 4);
    }
  }
}

/**
 * Emit `<indent><listPrefix><key>: <value>` - the universal shape of
 * `WriteMapInternal`. `listPrefix` adds `- ` for the first key of a
 * list entry; everything else is emitted without it. Value encoding
 * picks plain / quoted / block-scalar based on Rainbow's char triggers.
 */
function writeMap(
  lines: string[],
  key: string,
  value: string,
  indentCol: number,
  listPrefix: boolean = false,
): void {
  const prefix = ' '.repeat(indentCol) + (listPrefix ? '- ' : '') + key + ':';
  if (needsBlockScalar(value)) {
    lines.push(`${prefix} |`);
    const bodyIndent = indentCol + (listPrefix ? 2 : 0) + 2;
    const bodyPad = ' '.repeat(bodyIndent);
    for (const line of value.split('\n')) lines.push(`${bodyPad}${line}`);
  } else if (needsQuoting(value)) {
    lines.push(`${prefix} ${quoted(value)}`);
  } else {
    lines.push(`${prefix} ${value}`);
  }
}

/** Rainbow's block-scalar trigger set: `\n`, `\r`, `"`, `\\`. */
function needsBlockScalar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\n' || ch === '\r' || ch === '"' || ch === '\\') return true;
  }
  return false;
}

/** Rainbow's quoting trigger set: `"`, `:`, `[`, `]`, `{`, `}`, `!`, `?`, `-`. */
function needsQuoting(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if ('":[]{}!?-'.includes(value[i])) return true;
  }
  return false;
}

/** Rainbow `Encode`: wrap in `"…"` and escape any embedded `"` as `\"`. */
function quoted(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Update a single field's `Value` within an existing YAML document.
 * Parses via the grammar-faithful reader, mutates the `ScsItem`, and
 * re-serializes via the writer - so leading-space values, block
 * scalars, and Rainbow's quoting conventions all survive edits.
 * BOM and line-ending style are detected from the input so the file
 * stays format-consistent with how it was written.
 */
export function updateField(yamlContent: string, fieldId: string, newValue: string): string {
  const bom = yamlContent.charCodeAt(0) === 0xFEFF;
  const newline: '\n' | '\r\n' = yamlContent.includes('\r\n') ? '\r\n' : '\n';
  const item = parseItemFromString(yamlContent);
  const idLower = fieldId.toLowerCase();

  const fieldChanged =
    setFieldValue(item.sharedFields, idLower, newValue) ||
    item.languages.some(
      (lang) =>
        setFieldValue(lang.fields, idLower, newValue) ||
        lang.versions.some((v) => setFieldValue(v.fields, idLower, newValue)),
    );

  return fieldChanged ? serializeItem(item, { bom, newline }) : yamlContent;
}

function setFieldValue(fields: ScsField[], idLower: string, newValue: string): boolean {
  for (const field of fields) {
    if (field.id === idLower) {
      field.value = newValue;
      return true;
    }
  }
  return false;
}
