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

  it('emits all six entries when every field is populated', () => {
    const out = metadataEntries({
      name: 'N',
      author: 'A',
      version: 'V',
      comment: 'C',
      publisher: 'P',
      license: 'L',
    });
    expect(Object.keys(out).sort()).toEqual([
      'metadata/sc_author.txt',
      'metadata/sc_comment.txt',
      'metadata/sc_license.txt',
      'metadata/sc_name.txt',
      'metadata/sc_publisher.txt',
      'metadata/sc_version.txt',
    ]);
  });
});

describe('metadataEntries - omission of empty/undefined values', () => {
  it('omits entries for undefined optional fields', () => {
    const out = metadataEntries({ name: 'Pkg' });
    expect(Object.keys(out)).toEqual(['metadata/sc_name.txt']);
  });

  it('omits entries for empty-string optional fields', () => {
    const out = metadataEntries({
      name: 'Pkg',
      author: '',
      version: '',
      comment: '',
      publisher: '',
      license: '',
    });
    expect(Object.keys(out)).toEqual(['metadata/sc_name.txt']);
  });

  it('omits sc_name.txt when name is the empty string (parser-tolerant)', () => {
    // Name is required at the type level, but defending against a runtime
    // empty string keeps the rule "skip empty values" uniform across all
    // fields. Callers should set a default before invoking.
    const out = metadataEntries({ name: '' });
    expect(Object.keys(out)).not.toContain('metadata/sc_name.txt');
  });

  it('keeps populated fields and skips empty ones in the same call', () => {
    const out = metadataEntries({
      name: 'Pkg',
      author: 'Alice',
      version: '',
      comment: '',
      publisher: 'Foo Corp',
      license: '',
    });
    expect(Object.keys(out).sort()).toEqual([
      'metadata/sc_author.txt',
      'metadata/sc_name.txt',
      'metadata/sc_publisher.txt',
    ]);
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

  it('does NOT emit sc_readme.txt when readme is not on PackageMetadata (v1 omits empty fields)', () => {
    // The fixture has a 0-byte sc_readme.txt that Sitecore Desktop emitted
    // for an empty Readme. v1 PackageMetadata has no readme field, so the
    // emitter must not produce that entry.
    const out = metadataEntries({
      name: 'Content Package',
      author: 'Jason Wilkerson',
      version: '1',
      publisher: 'Sitecore Ukraine',
    });
    expect(Object.keys(out)).not.toContain('metadata/sc_readme.txt');
  });
});
