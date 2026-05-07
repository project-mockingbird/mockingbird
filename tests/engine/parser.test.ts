import { describe, it, expect } from 'vitest';
import { parseItem, parseItemFromString, NotAnItemDocumentError } from '../../src/engine/parser.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid/authoring/items');

describe('parseItem', () => {
  it('parses a template item from a .yml file', async () => {
    const result = await parseItem(resolve(FIXTURES, 'templates/MyTemplate/MyTemplate.yml'));
    expect(result.id).toBe('a1b2c3d4-e5f6-7890-abcd-000000000001');
    expect(result.parent).toBe('b2c3d4e5-f6a7-8901-bcde-000000000000');
    expect(result.template).toBe('ab86861a-6030-46c5-b394-e8f99e8b87db');
    expect(result.path).toBe('/sitecore/templates/Project/MyProject/MyTemplate');
  });

  it('parses SharedFields', async () => {
    const result = await parseItem(resolve(FIXTURES, 'templates/MyTemplate/MyTemplate.yml'));
    expect(result.sharedFields).toHaveLength(2);
    expect(result.sharedFields[0]).toEqual({
      id: '12c33f3f-86c5-43a5-aeb4-5598cec45116',
      hint: '__Base template',
      value: '{1930BBEB-7805-471A-A3BE-4858AC7CF696}',
    });
  });

  it('parses Languages, Fields, and Versions', async () => {
    const result = await parseItem(resolve(FIXTURES, 'templates/MyTemplate/MyTemplate.yml'));
    expect(result.languages).toHaveLength(1);
    expect(result.languages[0].language).toBe('en');
    expect(result.languages[0].versions).toHaveLength(1);
    expect(result.languages[0].versions[0].version).toBe(1);
    expect(result.languages[0].versions[0].fields).toHaveLength(1);
  });

  it('parses a template field with Type annotation on field entry', async () => {
    const result = await parseItem(resolve(FIXTURES, 'templates/MyTemplate/Data/Title/Title.yml'));
    const sharedField = result.sharedFields.find(f => f.hint === 'Shared');
    expect(sharedField).toBeDefined();
    expect(sharedField!.type).toBe('Checkbox');
    expect(sharedField!.value).toBe('0');
  });

  it('handles items with empty SharedFields by defaulting to empty array', async () => {
    const yaml = `---
ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/templates/Test/NoFields
`;
    const result = parseItemFromString(yaml);
    expect(result.sharedFields).toEqual([]);
    expect(result.languages).toEqual([]);
  });

  it('normalizes GUIDs to lowercase', async () => {
    const yaml = `---
ID: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "AB86861A-6030-46C5-B394-E8F99E8B87DB"
Path: /sitecore/test
`;
    const result = parseItemFromString(yaml);
    expect(result.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(result.template).toBe('ab86861a-6030-46c5-b394-e8f99e8b87db');
  });

  describe('SCS/Rainbow grammar compliance (not spec-YAML)', () => {
    // The SCS YAML reader/writer (decompiled from
    // `Sitecore.DevEx.Serialization.Client` + `Rainbow.Storage.Yaml`) uses a
    // hand-rolled line grammar: `key: ` separator is EXACTLY one space, and
    // everything after that is literal. Spec-compliant YAML parsers fold
    // plain-scalar leading whitespace, which lost round-trip byte parity
    // against prod Edge on every field whose authored value began with a
    // space (717 divergences observed as SCALAR_STR_DIFF_ROUTE at 0.3.1).

    it('preserves a leading space in a plain-scalar field Value', () => {
      const yaml = `---
ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/test
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "48322b30-7987-48cd-8dc8-4626bc8b7b98"
      Hint: Title
      Value:  Accelerate AI in the Practice
`;
      const result = parseItemFromString(yaml);
      const title = result.languages[0].versions[0].fields.find(f => f.hint === 'Title');
      expect(title?.value).toBe(' Accelerate AI in the Practice');
    });

    it('decodes a quoted scalar by stripping surrounding quotes and unescaping \\"', () => {
      const yaml = `---
ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/test
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "11111111-1111-1111-1111-111111111111"
      Hint: Title
      Value: "He said \\"hi\\""
`;
      const result = parseItemFromString(yaml);
      const f = result.languages[0].versions[0].fields[0];
      expect(f.value).toBe('He said "hi"');
    });

    it('reads a block-scalar (| header) joining subsequent lines with \\n, stripping the indent', () => {
      const yaml = `---
ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/test
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "64b12295-08d2-4495-a149-b11b38297c38"
      Hint: SelectedPeople
      Value: |
        {07D604E3-B304-4445-ABD0-2DD38B331DC0}
        {E7FC28C9-076C-4F51-97B8-ACF3D9D6998F}
`;
      const result = parseItemFromString(yaml);
      const f = result.languages[0].versions[0].fields[0];
      expect(f.value).toBe(
        '{07D604E3-B304-4445-ABD0-2DD38B331DC0}\n{E7FC28C9-076C-4F51-97B8-ACF3D9D6998F}',
      );
    });

    it('treats a colon-only line (no trailing space) as an empty value', () => {
      const yaml = `---
ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/test
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "b8f42732-9cb8-478d-ae95-07e25345fb0f"
      Hint: __Hide version
      Value:
`;
      const result = parseItemFromString(yaml);
      const f = result.languages[0].versions[0].fields[0];
      expect(f.value).toBe('');
    });

    it('strips the UTF-8 BOM before the --- header', () => {
      const yaml = `\uFEFF---
ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/test
`;
      const result = parseItemFromString(yaml);
      expect(result.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    });

  });

  it('strips braces from ID / Parent / Template when SCS writer emits them', async () => {
    // Some SCS serializers store id references brace-wrapped and
    // uppercase (real-world SCS variant). Mockingbird canonicalises to
    // bare-lowercase-dashed so tree lookups by `item.parent` match the
    // `byId` key set without any secondary normalisation step.
    const yaml = `---
ID: "{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}"
Parent: "{BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF}"
Template: "{AB86861A-6030-46C5-B394-E8F99E8B87DB}"
Path: /sitecore/test
`;
    const result = parseItemFromString(yaml);
    expect(result.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(result.parent).toBe('bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
    expect(result.template).toBe('ab86861a-6030-46c5-b394-e8f99e8b87db');
  });

  it('throws NotAnItemDocumentError for a Role-shaped document', () => {
    const yaml = `---
Role: editor
Description: A role item, not an Item
`;
    try {
      parseItemFromString(yaml);
    } catch (err) {
      expect(err).toBeInstanceOf(NotAnItemDocumentError);
      expect((err as NotAnItemDocumentError).firstKey).toBe('Role');
      return;
    }
    throw new Error('expected NotAnItemDocumentError to be thrown');
  });

  it('throws NotAnItemDocumentError with empty firstKey when document has no top-level keys', () => {
    const yaml = `---
`;
    try {
      parseItemFromString(yaml);
    } catch (err) {
      expect(err).toBeInstanceOf(NotAnItemDocumentError);
      expect((err as NotAnItemDocumentError).firstKey).toBe('');
      return;
    }
    throw new Error('expected NotAnItemDocumentError to be thrown');
  });
});
