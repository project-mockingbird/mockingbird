import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { metadataEntries } from '../../../src/engine/package/metadata.js';
import type { PackageMetadata } from '../../../src/engine/package/types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIR = resolvePath(__dirname, '../../fixtures/package/known-good');
const FIXTURE_METADATA_DIR = resolvePath(FIXTURE_DIR, 'expected-inner/metadata');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function hasBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
}

// ===========================================================================
// Phase A - structure / per-field invariants
// ===========================================================================

describe('metadataEntries - keys and field mapping', () => {
  it('emits sc_name.txt for the name field', () => {
    const out = metadataEntries({ name: 'Hello' });
    expect(Object.keys(out)).toContain('metadata/sc_name.txt');
    expect(decodeUtf8(out['metadata/sc_name.txt'])).toBe('Hello');
  });

  it('emits sc_author.txt for the author field', () => {
    const out = metadataEntries({ name: 'Pkg', author: 'Alice' });
    expect(decodeUtf8(out['metadata/sc_author.txt'])).toBe('Alice');
  });

  it('emits sc_version.txt for the version field', () => {
    const out = metadataEntries({ name: 'Pkg', version: '2.5' });
    expect(decodeUtf8(out['metadata/sc_version.txt'])).toBe('2.5');
  });

  it('emits sc_publisher.txt for the publisher field', () => {
    const out = metadataEntries({ name: 'Pkg', publisher: 'Foo Corp' });
    expect(decodeUtf8(out['metadata/sc_publisher.txt'])).toBe('Foo Corp');
  });

  it('emits sc_comment.txt for the comment field', () => {
    const out = metadataEntries({ name: 'Pkg', comment: 'A note' });
    expect(decodeUtf8(out['metadata/sc_comment.txt'])).toBe('A note');
  });

  it('emits sc_license.txt for the license field', () => {
    const out = metadataEntries({ name: 'Pkg', license: 'MIT' });
    expect(decodeUtf8(out['metadata/sc_license.txt'])).toBe('MIT');
  });

  it('always emits the full set of ten recognized metadata keys (empty where unset)', () => {
    // Real Sitecore writes all MetadataView keys, empty where unset - the
    // sample CM package shipped all ten, populated only on sc_name.
    const out = metadataEntries({ name: 'N' });
    expect(Object.keys(out).sort()).toEqual([
      'metadata/sc_author.txt',
      'metadata/sc_comment.txt',
      'metadata/sc_license.txt',
      'metadata/sc_name.txt',
      'metadata/sc_packageid.txt',
      'metadata/sc_poststep.txt',
      'metadata/sc_publisher.txt',
      'metadata/sc_readme.txt',
      'metadata/sc_revision.txt',
      'metadata/sc_version.txt',
    ]);
    // Populated value present; the rest are empty (0-byte) placeholders.
    expect(decodeUtf8(out['metadata/sc_name.txt'])).toBe('N');
    expect(out['metadata/sc_author.txt'].length).toBe(0);
    expect(out['metadata/sc_revision.txt'].length).toBe(0);
    expect(out['metadata/sc_packageid.txt'].length).toBe(0);
  });

  it('populates each PackageMetadata field into its entry', () => {
    const out = metadataEntries({
      name: 'N', author: 'A', version: 'V', comment: 'C', publisher: 'P', license: 'L',
    });
    expect(decodeUtf8(out['metadata/sc_name.txt'])).toBe('N');
    expect(decodeUtf8(out['metadata/sc_author.txt'])).toBe('A');
    expect(decodeUtf8(out['metadata/sc_version.txt'])).toBe('V');
    expect(decodeUtf8(out['metadata/sc_comment.txt'])).toBe('C');
    expect(decodeUtf8(out['metadata/sc_publisher.txt'])).toBe('P');
    expect(decodeUtf8(out['metadata/sc_license.txt'])).toBe('L');
  });
});

describe('metadataEntries - empty placeholders for unset values', () => {
  it('emits all ten keys with empty placeholders for undefined optional fields', () => {
    const out = metadataEntries({ name: 'Pkg' });
    expect(Object.keys(out)).toHaveLength(10);
    // Only sc_name carries a value; the rest are 0-byte placeholders.
    for (const [key, bytes] of Object.entries(out)) {
      if (key === 'metadata/sc_name.txt') {
        expect(decodeUtf8(bytes)).toBe('Pkg');
      } else {
        expect(bytes.length, `${key} should be an empty placeholder`).toBe(0);
      }
    }
  });

  it('emits empty placeholders for empty-string optional fields', () => {
    const out = metadataEntries({
      name: 'Pkg', author: '', version: '', comment: '', publisher: '', license: '',
    });
    expect(out['metadata/sc_author.txt'].length).toBe(0);
    expect(out['metadata/sc_version.txt'].length).toBe(0);
    expect(decodeUtf8(out['metadata/sc_name.txt'])).toBe('Pkg');
  });

  it('keeps populated fields and leaves unset ones empty in the same call', () => {
    const out = metadataEntries({
      name: 'Pkg', author: 'Alice', version: '', comment: '', publisher: 'Foo Corp', license: '',
    });
    expect(decodeUtf8(out['metadata/sc_author.txt'])).toBe('Alice');
    expect(decodeUtf8(out['metadata/sc_publisher.txt'])).toBe('Foo Corp');
    expect(out['metadata/sc_version.txt'].length).toBe(0);
    expect(out['metadata/sc_comment.txt'].length).toBe(0);
    expect(out['metadata/sc_license.txt'].length).toBe(0);
  });
});

describe('metadataEntries - byte-level format', () => {
  it('emits no BOM at the start of any value', () => {
    const out = metadataEntries({
      name: 'N',
      author: 'A',
      version: 'V',
      comment: 'C',
      publisher: 'P',
      license: 'L',
    });
    for (const [key, bytes] of Object.entries(out)) {
      expect(hasBom(bytes), `entry ${key} must not have a UTF-8 BOM`).toBe(false);
    }
  });

  it('emits no trailing newline on any value', () => {
    const out = metadataEntries({
      name: 'NA',
      author: 'A',
      version: '1',
      comment: 'C',
      publisher: 'P',
      license: 'L',
    });
    for (const [key, bytes] of Object.entries(out)) {
      const last = bytes[bytes.length - 1];
      expect(last !== 0x0A && last !== 0x0D, `entry ${key} must not end with CR or LF`).toBe(true);
    }
  });

  it('round-trips multi-byte UTF-8 with the right byte count (cafe acute -> 5 bytes)', () => {
    const out = metadataEntries({ name: 'Pkg', author: 'café' });
    const bytes = out['metadata/sc_author.txt'];
    expect(bytes.length).toBe(5);
    expect(decodeUtf8(bytes)).toBe('café');
  });

  it('passes XML-special characters through verbatim (no escaping)', () => {
    const out = metadataEntries({ name: 'A & B <c>' });
    expect(decodeUtf8(out['metadata/sc_name.txt'])).toBe('A & B <c>');
  });

  it('passes ampersand and angle brackets verbatim in author', () => {
    const out = metadataEntries({ name: 'Pkg', author: 'Smith & Co. <legal>' });
    expect(decodeUtf8(out['metadata/sc_author.txt'])).toBe('Smith & Co. <legal>');
  });
});

// ===========================================================================
// Phase B - fixture round-trip
// ===========================================================================

describe('metadataEntries - fixture round-trip', () => {
  it('emits byte-identical metadata files for the known-good fixture', async () => {
    const meta: PackageMetadata = {
      name: 'Content Package',
      author: 'Jason Wilkerson',
      version: '1',
      publisher: 'Sitecore Ukraine',
    };

    const out = metadataEntries(meta);

    const checks: Array<[string, string]> = [
      ['metadata/sc_name.txt', 'sc_name.txt'],
      ['metadata/sc_author.txt', 'sc_author.txt'],
      ['metadata/sc_version.txt', 'sc_version.txt'],
      ['metadata/sc_publisher.txt', 'sc_publisher.txt'],
    ];

    for (const [entryKey, fixtureName] of checks) {
      const expectedBuf = await readFile(resolvePath(FIXTURE_METADATA_DIR, fixtureName));
      const expected = new Uint8Array(
        expectedBuf.buffer,
        expectedBuf.byteOffset,
        expectedBuf.byteLength,
      );
      const actual = out[entryKey];
      expect(actual, `entry ${entryKey} must be present`).toBeDefined();
      expect(actual.length, `entry ${entryKey} length`).toBe(expected.length);
      // Byte-for-byte equality.
      for (let i = 0; i < expected.length; i++) {
        if (actual[i] !== expected[i]) {
          throw new Error(
            `entry ${entryKey} byte mismatch at offset ${i}: ` +
            `expected 0x${expected[i].toString(16).padStart(2, '0')}, ` +
            `actual 0x${actual[i].toString(16).padStart(2, '0')}`,
          );
        }
      }
    }
  });

  it('emits an empty (0-byte) sc_readme.txt matching the fixture', async () => {
    // The fixture has a 0-byte sc_readme.txt that Sitecore emitted for an empty
    // Readme. PackageMetadata has no readme field, so the emitter produces the
    // empty placeholder - byte-identical to the fixture's 0-byte file.
    const out = metadataEntries({
      name: 'Content Package',
      author: 'Jason Wilkerson',
      version: '1',
      publisher: 'Sitecore Ukraine',
    });
    expect(out['metadata/sc_readme.txt']).toBeDefined();
    const expected = await readFile(resolvePath(FIXTURE_METADATA_DIR, 'sc_readme.txt'));
    expect(out['metadata/sc_readme.txt'].length).toBe(expected.length);
    expect(out['metadata/sc_readme.txt'].length).toBe(0);
  });
});
