import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { serializeItem, updateField } from '../../src/engine/serializer.js';
import { parseItemFromString } from '../../src/engine/parser.js';
import type { ScsItem } from '../../src/engine/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('serializeItem', () => {
  it('produces valid SCS YAML from an ScsItem', () => {
    const item: ScsItem = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      parent: '00000000-0000-0000-0000-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/templates/Test/Item',
      sharedFields: [
        { id: '12c33f3f-86c5-43a5-aeb4-5598cec45116', hint: '__Base template', value: '{1930BBEB-7805-471A-A3BE-4858AC7CF696}' },
      ],
      languages: [],
    };
    const yaml = serializeItem(item);
    expect(yaml).toContain('ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"');
    expect(yaml).toContain('Path: /sitecore/templates/Test/Item');
    expect(yaml).toContain('Hint: __Base template');

    // Round-trip: parse it back
    const parsed = parseItemFromString(yaml);
    expect(parsed.id).toBe(item.id);
    expect(parsed.sharedFields[0].hint).toBe('__Base template');
  });

  it('includes Type annotation when present on a field', () => {
    const item: ScsItem = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      parent: '00000000-0000-0000-0000-000000000000',
      template: '455a3e98-a627-4b40-8035-e683a0331ac7',
      path: '/sitecore/templates/Test/Field',
      sharedFields: [
        { id: 'be351a73-fcb0-4213-93fa-c302d8ab4f51', hint: 'Shared', value: '1', type: 'Checkbox' },
      ],
      languages: [],
    };
    const yaml = serializeItem(item);
    expect(yaml).toContain('Type: Checkbox');
  });

  it('omits SharedFields key when array is empty', () => {
    const item: ScsItem = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      parent: '00000000-0000-0000-0000-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/templates/Test/NoFields',
      sharedFields: [],
      languages: [],
    };
    const yaml = serializeItem(item);
    expect(yaml).not.toContain('SharedFields');
    expect(yaml).not.toContain('Languages');
  });

  it('serializes full language/version structure', () => {
    const item: ScsItem = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      parent: '00000000-0000-0000-0000-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/templates/Test/WithLang',
      sharedFields: [],
      languages: [
        {
          language: 'en',
          fields: [{ id: 'aaa', hint: 'LangField', value: 'val' }],
          versions: [
            { version: 1, fields: [{ id: 'bbb', hint: 'VerField', value: 'ver-val' }] },
          ],
        },
      ],
    };
    const yaml = serializeItem(item);
    expect(yaml).toContain('Language: en');
    expect(yaml).toContain('Version: 1');
    expect(yaml).toContain('Hint: LangField');
    expect(yaml).toContain('Hint: VerField');
  });
});

/**
 * Detect BOM and line-ending style from an existing SCS YAML file so
 * round-trip tests can compare byte-for-byte against the source's own
 * formatting conventions (which vary by author: dotnet-CLI output on
 * Windows has BOM+CRLF, some test fixtures have no BOM, pure Linux-
 * authored files would be LF).
 */
function detectOptions(yaml: string): { bom: boolean; newline: '\n' | '\r\n' } {
  return {
    bom: yaml.charCodeAt(0) === 0xFEFF,
    newline: yaml.includes('\r\n') ? '\r\n' : '\n',
  };
}

describe('serializeItem - Rainbow round-trip byte-parity', () => {
  it('round-trips a simple template fixture byte-identically', async () => {
    const filePath = resolve(VALID_FIXTURES, 'authoring/items/templates/MyTemplate/MyTemplate.yml');
    const original = await readFile(filePath, 'utf-8');
    const parsed = parseItemFromString(original);
    const serialized = serializeItem(parsed, detectOptions(original));
    expect(serialized).toBe(original);
  });

  it('round-trips every tracked fixture under tests/fixtures/valid byte-identically', async () => {
    const yamlFiles: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name.endsWith('.yml')) yamlFiles.push(full);
      }
    }
    await walk(VALID_FIXTURES);
    expect(yamlFiles.length).toBeGreaterThan(0);

    const mismatches: string[] = [];
    for (const file of yamlFiles) {
      const original = await readFile(file, 'utf-8');
      if (!original.includes('---')) continue;
      try {
        const parsed = parseItemFromString(original);
        const serialized = serializeItem(parsed, detectOptions(original));
        if (serialized !== original) mismatches.push(file);
      } catch {
        // Non-item YAML (parser throws on missing ---); ignore.
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('preserves a leading-space value (the original reason the parser was rewritten)', () => {
    const yaml =
      '---\n' +
      'ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"\n' +
      'Parent: "00000000-0000-0000-0000-000000000000"\n' +
      'Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"\n' +
      'Path: /sitecore/test\n' +
      'Languages:\n' +
      '- Language: en\n' +
      '  Versions:\n' +
      '  - Version: 1\n' +
      '    Fields:\n' +
      '    - ID: "25bed78c-4957-4165-998a-ca1b52f67497"\n' +
      '      Hint: Title\n' +
      '      Value:  Accelerate AI in the Practice\n';

    const parsed = parseItemFromString(yaml);
    expect(parsed.languages[0].versions[0].fields[0].value).toBe(' Accelerate AI in the Practice');
    expect(serializeItem(parsed, { bom: false, newline: '\n' })).toBe(yaml);
  });

  it('uses block-scalar form for values containing a backslash (Rainbow rule)', () => {
    const yaml =
      '---\n' +
      'ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"\n' +
      'Parent: "00000000-0000-0000-0000-000000000000"\n' +
      'Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"\n' +
      'Path: /sitecore/test\n' +
      'Languages:\n' +
      '- Language: en\n' +
      '  Versions:\n' +
      '  - Version: 1\n' +
      '    Fields:\n' +
      '    - ID: "52807595-0f8f-4b20-8d2a-cb71d28c6103"\n' +
      '      Hint: __Owner\n' +
      '      Value: |\n' +
      '        sitecore\\Admin\n';

    const parsed = parseItemFromString(yaml);
    expect(parsed.languages[0].versions[0].fields[0].value).toBe('sitecore\\Admin');
    expect(serializeItem(parsed, { bom: false, newline: '\n' })).toBe(yaml);
  });

  it('quotes brace-wrapped GUID values on write', () => {
    const item: ScsItem = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      parent: '00000000-0000-0000-0000-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/test',
      sharedFields: [
        {
          id: '12c33f3f-86c5-43a5-aeb4-5598cec45116',
          hint: '__Base template',
          value: '{1930BBEB-7805-471A-A3BE-4858AC7CF696}',
        },
      ],
      languages: [],
    };
    const out = serializeItem(item, { bom: false, newline: '\n' });
    expect(out).toContain('Value: "{1930BBEB-7805-471A-A3BE-4858AC7CF696}"');
  });

  it('emits plain scalars for values without any of Rainbow\'s 9 trigger chars', () => {
    const item: ScsItem = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      parent: '00000000-0000-0000-0000-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/test',
      sharedFields: [
        { id: '25bed78c-4957-4165-998a-ca1b52f67497', hint: '__Created', value: '20230309T164152Z' },
      ],
      languages: [],
    };
    const out = serializeItem(item, { bom: false, newline: '\n' });
    expect(out).toContain('Value: 20230309T164152Z');
    expect(out).not.toContain('Value: "20230309T164152Z"');
  });

  it('round-trips BranchID when present', () => {
    const yaml =
      '---\n' +
      'ID: "b48df5bf-6eaf-4f7e-94c8-ec97e516c0c4"\n' +
      'Parent: "4ce84ddb-bb67-47bd-92ed-ef9397b69674"\n' +
      'Template: "5f486933-4fcc-425c-9d44-f293b9020e4e"\n' +
      'Path: /sitecore/content/tenant/common/Home\n' +
      'BranchID: "45cf9f42-b3ac-4412-aab9-f8441c7e448e"\n';
    const parsed = parseItemFromString(yaml);
    expect(parsed.branchId).toBe('45cf9f42-b3ac-4412-aab9-f8441c7e448e');
    expect(serializeItem(parsed, { bom: false, newline: '\n' })).toBe(yaml);
  });

  it('round-trips an external SCS content tree when MOCKINGBIRD_EXTERNAL_CONTENT_TREE is set', async () => {
    // Dev-machine sanity check: point this at any real SCS authoring root
    // (e.g. via `MOCKINGBIRD_EXTERNAL_CONTENT_TREE=/path/to/authoring/items npx vitest run`)
    // and the test walks every .yml under it, asserting byte-identical
    // round-trip. Unset / missing path → test is a no-op so CI stays portable.
    const externalRoot = process.env.MOCKINGBIRD_EXTERNAL_CONTENT_TREE;
    if (!externalRoot || !existsSync(externalRoot)) return;

    const yamlFiles: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name.endsWith('.yml')) yamlFiles.push(full);
      }
    }
    await walk(externalRoot);
    expect(yamlFiles.length).toBeGreaterThan(0);

    const mismatches: { file: string; firstDiffAt: number }[] = [];
    let itemsChecked = 0;
    for (const file of yamlFiles) {
      const original = await readFile(file, 'utf-8');
      try {
        const parsed = parseItemFromString(original);
        // Role / user / other SCS schemas don't populate `ID` - skip them.
        if (!parsed.id) continue;
        itemsChecked++;
        const serialized = serializeItem(parsed, detectOptions(original));
        if (serialized !== original) {
          let diffAt = 0;
          while (diffAt < Math.min(original.length, serialized.length) && original[diffAt] === serialized[diffAt]) diffAt++;
          mismatches.push({ file, firstDiffAt: diffAt });
          if (mismatches.length >= 5) break;
        }
      } catch {
        // Non-item YAML; ignore.
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('updateField (format-preserving)', () => {
  const originalYaml = `---
ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/templates/Test/Item
SharedFields:
- ID: "12c33f3f-86c5-43a5-aeb4-5598cec45116"
  Hint: __Base template
  Value: "{1930BBEB-7805-471A-A3BE-4858AC7CF696}"
`;

  it('updates a field value without changing other formatting', () => {
    const updated = updateField(originalYaml, '12c33f3f-86c5-43a5-aeb4-5598cec45116', '{NEW-GUID}');
    expect(updated).toContain('Value: "{NEW-GUID}"');
    // Verify other fields are untouched
    expect(updated).toContain('ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"');
    expect(updated).toContain('Path: /sitecore/templates/Test/Item');
  });
});
