import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildInnerZip, buildOuterZip } from '../../../src/engine/package/zip-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ===========================================================================
// buildInnerZip - inner package.zip layout
// ===========================================================================

describe('buildInnerZip', () => {
  it('writes installer/version with the literal installerVersion bytes (no BOM, no trailing newline)', () => {
    const zip = buildInnerZip({
      installerVersion: '41.00.000000.000000',
      metadata: {},
      itemEntries: {},
    });
    const unpacked = unzipSync(zip);
    expect(unpacked['installer/version']).toBeDefined();
    const bytes = unpacked['installer/version'];
    // No BOM.
    expect(bytes[0]).not.toBe(0xEF);
    expect(strFromU8(bytes)).toBe('41.00.000000.000000');
    expect(bytes.length).toBe(19);
  });

  it('passes metadata entries through verbatim with their full zip paths', () => {
    const meta: Record<string, Uint8Array> = {
      'metadata/sc_name.txt': encodeUtf8('My Package'),
      'metadata/sc_author.txt': encodeUtf8('Alice'),
      'metadata/sc_version.txt': encodeUtf8('1.0'),
    };
    const zip = buildInnerZip({
      installerVersion: '41.00.000000.000000',
      metadata: meta,
      itemEntries: {},
    });
    const unpacked = unzipSync(zip);
    expect(strFromU8(unpacked['metadata/sc_name.txt'])).toBe('My Package');
    expect(strFromU8(unpacked['metadata/sc_author.txt'])).toBe('Alice');
    expect(strFromU8(unpacked['metadata/sc_version.txt'])).toBe('1.0');
  });

  it('passes metadata bytes through byte-for-byte (no transformation)', () => {
    // Including a UTF-8 BOM in the input to confirm zero-byte transformation.
    const raw = new Uint8Array([0xEF, 0xBB, 0xBF, 0x68, 0x69]); // BOM + "hi"
    const zip = buildInnerZip({
      installerVersion: '41.00.000000.000000',
      metadata: { 'metadata/sc_readme.txt': raw },
      itemEntries: {},
    });
    const unpacked = unzipSync(zip);
    expect(Array.from(unpacked['metadata/sc_readme.txt'])).toEqual(Array.from(raw));
  });

  it('passes itemEntries keys through verbatim (no installer/items/ prefix munging)', () => {
    const itemKey = 'items/master/sitecore/content/Site/Hello/{A1B2C3D4-E5F6-7890-1234-5678901234AB}/en/1/xml';
    const propKey = 'properties/items/master/sitecore/content/Site/Hello/{A1B2C3D4-E5F6-7890-1234-5678901234AB}/en/1/xml';
    const itemEntries: Record<string, Uint8Array> = {
      [itemKey]: encodeUtf8('<item />'),
      [propKey]: encodeUtf8('database=master\r\n'),
    };
    const zip = buildInnerZip({
      installerVersion: '41.00.000000.000000',
      metadata: {},
      itemEntries,
    });
    const unpacked = unzipSync(zip);
    expect(unpacked[itemKey]).toBeDefined();
    expect(unpacked[propKey]).toBeDefined();
    expect(strFromU8(unpacked[itemKey])).toBe('<item />');
    expect(strFromU8(unpacked[propKey])).toBe('database=master\r\n');
  });

  it('does not produce any installer/items/ prefixed entries (sanity check)', () => {
    const itemEntries: Record<string, Uint8Array> = {
      'items/master/sitecore/content/Foo/{00000000-0000-0000-0000-000000000001}/en/1/xml':
        encodeUtf8('<item />'),
    };
    const zip = buildInnerZip({
      installerVersion: '41.00.000000.000000',
      metadata: {},
      itemEntries,
    });
    const unpacked = unzipSync(zip);
    expect(Object.keys(unpacked).every((k) => !k.startsWith('installer/items/'))).toBe(true);
  });

  it('does not emit installer/project in v1', () => {
    const zip = buildInnerZip({
      installerVersion: '41.00.000000.000000',
      metadata: { 'metadata/sc_name.txt': encodeUtf8('X') },
      itemEntries: {
        'items/master/sitecore/content/X/{00000000-0000-0000-0000-000000000001}/en/1/xml':
          encodeUtf8('<item />'),
      },
    });
    const unpacked = unzipSync(zip);
    expect(unpacked['installer/project']).toBeUndefined();
  });

  it('produces a decompressible zip with the expected entry list', () => {
    const zip = buildInnerZip({
      installerVersion: '41.00.000000.000000',
      metadata: {
        'metadata/sc_name.txt': encodeUtf8('Pkg'),
      },
      itemEntries: {
        'items/master/sitecore/content/Hello/{ABCDEF01-2345-6789-ABCD-EF0123456789}/en/1/xml':
          encodeUtf8('<item />'),
        'properties/items/master/sitecore/content/Hello/{ABCDEF01-2345-6789-ABCD-EF0123456789}/en/1/xml':
          encodeUtf8('database=master\r\n'),
      },
    });
    const unpacked = unzipSync(zip);
    const keys = Object.keys(unpacked).sort();
    expect(keys).toEqual([
      'installer/version',
      'items/master/sitecore/content/Hello/{ABCDEF01-2345-6789-ABCD-EF0123456789}/en/1/xml',
      'metadata/sc_name.txt',
      'properties/items/master/sitecore/content/Hello/{ABCDEF01-2345-6789-ABCD-EF0123456789}/en/1/xml',
    ]);
  });
});

// ===========================================================================
// buildOuterZip - outer .zip wrap (single package.zip entry)
// ===========================================================================

describe('buildOuterZip', () => {
  it('produces an outer zip containing exactly one entry: package.zip', () => {
    const inner = new Uint8Array([1, 2, 3, 4, 5]);
    const outer = buildOuterZip(inner);
    const unpacked = unzipSync(outer);
    expect(Object.keys(unpacked)).toEqual(['package.zip']);
  });

  it('package.zip entry is byte-identical to the input innerPackageZip', () => {
    const inner = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xde, 0xad, 0xbe, 0xef]);
    const outer = buildOuterZip(inner);
    const unpacked = unzipSync(outer);
    expect(Array.from(unpacked['package.zip'])).toEqual(Array.from(inner));
  });

  it('does not emit an outer metadata.xml', () => {
    const outer = buildOuterZip(new Uint8Array([1, 2, 3]));
    const unpacked = unzipSync(outer);
    expect(unpacked['metadata.xml']).toBeUndefined();
  });

  it('round-trips a real inner-zip build through outer wrap', () => {
    const inner = buildInnerZip({
      installerVersion: '41.00.000000.000000',
      metadata: { 'metadata/sc_name.txt': encodeUtf8('SmokePkg') },
      itemEntries: {
        'items/master/sitecore/content/X/{00000000-0000-0000-0000-000000000001}/en/1/xml':
          encodeUtf8('<item />'),
        'properties/items/master/sitecore/content/X/{00000000-0000-0000-0000-000000000001}/en/1/xml':
          encodeUtf8('database=master\r\n'),
      },
    });
    const outer = buildOuterZip(inner);

    // Outer layer.
    const outerUnpacked = unzipSync(outer);
    expect(Object.keys(outerUnpacked)).toEqual(['package.zip']);

    // Inner layer reachable through the outer.
    const innerUnpacked = unzipSync(outerUnpacked['package.zip']);
    expect(strFromU8(innerUnpacked['installer/version'])).toBe('41.00.000000.000000');
    expect(strFromU8(innerUnpacked['metadata/sc_name.txt'])).toBe('SmokePkg');
    expect(
      innerUnpacked['items/master/sitecore/content/X/{00000000-0000-0000-0000-000000000001}/en/1/xml'],
    ).toBeDefined();
    expect(
      innerUnpacked['properties/items/master/sitecore/content/X/{00000000-0000-0000-0000-000000000001}/en/1/xml'],
    ).toBeDefined();
  });
});
