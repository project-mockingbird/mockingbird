import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { Engine } from '../../../src/engine/index.js';
import { emitItemXml } from '../../../src/engine/package/item-xml.js';
import { emitProperties } from '../../../src/engine/package/properties.js';
import {
  resolveItemName,
  resolveTemplateName,
} from '../../../src/engine/package/lookups.js';
import type { ItemNode } from '../../../src/engine/types.js';

// ---------------------------------------------------------------------------
// Tier 3 - content tree round-trip across the live serialization tree
// ---------------------------------------------------------------------------
//
// The Tier 2 invariants (GUID casing, attribute order, BOM, sharing labels,
// etc.) are covered in the per-emitter unit tests. Tier 3 sanity-checks the
// emitters survive the live serialization tree - real-world template
// inheritance shapes, occasional orphan-parent-template fields, multi-
// language items, multi-version items, etc.
//
// The test gracefully skips when there is no live tree available
// (fresh checkout, CI without a bind-mount).

describe('emitter content tree round-trip (Tier 3)', () => {
  it('emits well-formed output for representative items from the live tree', async () => {
    const rootDir = process.env.MOCKINGBIRD_ROOT_DIR ?? process.cwd();
    // Skip if there's nothing to walk.
    if (!existsSync(resolvePath(rootDir, 'sitecore.json'))) {
      return;
    }

    // Use the real registry if present so the template-walk can resolve
    // OOTB Sitecore templates the content tree inherits from. Falls back to no
    // registry if the file isn't on disk (template lookups for OOTB items
    // will throw; the test catches and skips those items).
    const registryPath = resolvePath(rootDir, 'data/registry.json.gz');
    const engine = new Engine({
      rootDir,
      watch: false,
      registryPath: existsSync(registryPath) ? registryPath : undefined,
    });
    await engine.startInit();
    await engine.readiness.ready();

    const all = engine.getAllItems();
    if (all.length === 0) {
      // No live tree available - skip rather than fail.
      return;
    }

    const sampled = pickRepresentative(all, 50);
    expect(sampled.length).toBeGreaterThan(0);

    let checkedItems = 0;
    let checkedVersions = 0;

    for (const node of sampled) {
      const item = node.item;

      let templateName: string;
      try {
        templateName = resolveTemplateName(engine, item.template).toLowerCase();
      } catch {
        // Skip items whose template isn't known (orphans / out-of-tree
        // templates that are also missing from the registry).
        continue;
      }

      const itemName = resolveItemName(item);
      checkedItems++;

      for (const lang of item.languages) {
        for (const v of lang.versions) {
          const versionRef = { language: lang.language, version: v.version };

          let xml: string;
          try {
            xml = emitItemXml(engine, item, versionRef, {
              itemName,
              templateName,
              createdIso: '00010101T000000Z',
            });
          } catch {
            // Per-version emit failure (e.g. broken template chain) -
            // the buildPackage entrypoint catches these and surfaces
            // them as parse-failure warnings; for the content tree test we
            // count it as "doesn't emit, doesn't crash the suite".
            continue;
          }

          // Emitter output: well-formed single-line XML.
          expect(xml.startsWith('<item ')).toBe(true);
          expect(xml).toContain('</item>');
          expect(xml).toContain('<fields>');
          expect(xml).toContain('</fields>');

          // Required item attributes are all present.
          expect(xml).toMatch(/\sid="\{[A-F0-9-]+\}"/);
          expect(xml).toMatch(/\stid="\{[A-F0-9-]+\}"/);
          expect(xml).toMatch(/\sparentid="\{[A-F0-9-]+\}"/);
          expect(xml).toMatch(/\slanguage="[^"]+"/);
          expect(xml).toMatch(/\sversion="\d+"/);
          expect(xml).toMatch(/\screated="[^"]*"/);

          // Properties output: BOM-prefixed text bytes.
          let propsBytes: Uint8Array;
          try {
            propsBytes = emitProperties(engine, item, versionRef);
          } catch {
            continue;
          }
          expect(propsBytes.length).toBeGreaterThan(3);
          expect(propsBytes[0]).toBe(0xEF);
          expect(propsBytes[1]).toBe(0xBB);
          expect(propsBytes[2]).toBe(0xBF);

          // Header lines (after BOM) include database, id, language, version.
          const text = new TextDecoder('utf-8').decode(propsBytes.subarray(3));
          expect(text).toContain('database=master\r\n');
          expect(text).toMatch(/id=\{[A-F0-9-]+\}\r\n/);
          expect(text).toContain(`language=${lang.language}\r\n`);
          expect(text).toContain(`version=${v.version}\r\n`);

          checkedVersions++;
        }
      }
    }

    // The test is meaningful only if we actually emitted something.
    expect(checkedItems).toBeGreaterThan(0);
    expect(checkedVersions).toBeGreaterThan(0);
  }, 60_000);
});

/**
 * Sample evenly across the tree by sorting on path and taking every Nth
 * item. With path-lex sort that gives us a slice that spans templates,
 * pages, datasources, media, standard-values - whatever shapes the live
 * tree carries.
 */
function pickRepresentative(nodes: ItemNode[], count: number): ItemNode[] {
  const sorted = [...nodes].sort((a, b) => a.item.path.localeCompare(b.item.path));
  if (sorted.length <= count) return sorted;
  const step = Math.max(1, Math.floor(sorted.length / count));
  const out: ItemNode[] = [];
  for (let i = 0; i < sorted.length && out.length < count; i += step) {
    out.push(sorted[i]);
  }
  return out;
}
