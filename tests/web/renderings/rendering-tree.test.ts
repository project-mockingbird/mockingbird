import { describe, it, expect } from 'vitest';
import { buildRenderingTree } from '@/components/detail/field-editors/renderings/rendering-tree';
import type { RenderingMeta } from '@/lib/types';

// A non-folder template GUID used for "real rendering" test fixtures (anything
// not in the folder-template set the tree-builder treats as a folder).
const RENDERING_TEMPLATE = '99f8905d-e352-41e0-aff4-8d3a5f66f3f0';
const RENDERING_FOLDER_TEMPLATE = '7ee0975b-0698-493e-b3a2-0b2ef33d0522';

function rm(over: Partial<RenderingMeta> & { path: string; id: string; displayName: string }): RenderingMeta {
  return {
    id: over.id,
    name: over.displayName,
    displayName: over.displayName,
    path: over.path,
    template: over.template ?? RENDERING_TEMPLATE,
    sortOrder: over.sortOrder,
  };
}

describe('buildRenderingTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildRenderingTree([])).toEqual([]);
  });

  it('places a single rendering at the root as a leaf (parent path trimmed)', () => {
    const r = rm({ id: '{R1}', displayName: 'SkipLink', path: '/sitecore/layout/Renderings/Foundation/Multisite/Accessibility/SkipLink' });
    const roots = buildRenderingTree([r]);
    expect(roots).toHaveLength(1);
    expect(roots[0].isLeaf).toBe(true);
    expect(roots[0].segment).toBe('SkipLink');
    expect(roots[0].rendering?.id).toBe('{R1}');
  });

  it('trims the longest shared path prefix so projects appear at the root', () => {
    const r1 = rm({ id: '{1}', displayName: 'SkipLink', path: '/sitecore/layout/Renderings/Foundation/Multisite/Accessibility/SkipLink' });
    const r2 = rm({ id: '{2}', displayName: 'Rich Text', path: '/sitecore/layout/Renderings/Feature/JSS/Page Content/Rich Text' });
    const roots = buildRenderingTree([r1, r2]);
    // Common prefix is /sitecore/layout/Renderings; root segments are Feature and Foundation.
    expect(roots.map(n => n.segment).sort()).toEqual(['Feature', 'Foundation']);
    // Foundation walks down through its own subtree to the leaf.
    const foundation = roots.find(n => n.segment === 'Foundation')!;
    expect(foundation.isLeaf).toBe(false);
    const multisite = foundation.children[0];
    expect(multisite.segment).toBe('Multisite');
    const accessibility = multisite.children[0];
    expect(accessibility.segment).toBe('Accessibility');
    expect(accessibility.children).toHaveLength(1);
    expect(accessibility.children[0].rendering?.id).toBe('{1}');
  });

  it('places leaves at the root when all renderings share a parent folder', () => {
    const a = rm({ id: '{A}', displayName: 'A Rich Text', path: '/sitecore/layout/Renderings/Feature/Page Content/A Rich Text' });
    const b = rm({ id: '{B}', displayName: 'B Image', path: '/sitecore/layout/Renderings/Feature/Page Content/B Image' });
    const roots = buildRenderingTree([a, b]);
    // Common prefix consumes the shared parent folder; leaves end up at root.
    expect(roots).toHaveLength(2);
    expect(roots.every(n => n.isLeaf)).toBe(true);
    expect(roots.map(n => n.rendering!.id).sort()).toEqual(['{A}', '{B}']);
  });

  it('sorts siblings by sortOrder + name with no folders-first override', () => {
    // No sortOrder on any item; all default to 100, so pure alphabetical by name.
    // Alpha < Charlie < SubFolder - the folder sorts last because its name is last.
    const folder = rm({ id: '{F}', displayName: 'Bravo', path: '/x/y/SubFolder/Bravo' });
    const leafA = rm({ id: '{LA}', displayName: 'Alpha', path: '/x/y/Alpha' });
    const leafC = rm({ id: '{LC}', displayName: 'Charlie', path: '/x/y/Charlie' });
    const roots = buildRenderingTree([folder, leafA, leafC]);
    // Common prefix /x/y; roots are Alpha (leaf), Charlie (leaf), SubFolder (folder).
    // Folder is not hoisted to front - it sorts by segment name alphabetically.
    const ordering = roots.map(c => `${c.isLeaf ? 'leaf' : 'folder'}:${c.segment}`);
    expect(ordering).toEqual(['leaf:Alpha', 'leaf:Charlie', 'folder:SubFolder']);
    expect(roots[2].children[0].segment).toBe('Bravo');
  });

  it('sorts sibling leaves alphabetically by displayName, not segment', () => {
    // Same parent, segments A and Z, but displayNames are inverted.
    const a = rm({ id: '{A}', displayName: 'Zebra', path: '/p/q/A' });
    const z = rm({ id: '{Z}', displayName: 'Alpha', path: '/p/q/Z' });
    const roots = buildRenderingTree([a, z]);
    expect(roots).toHaveLength(2);
    expect(roots.every(n => n.isLeaf)).toBe(true);
    // Sorted by displayName: Alpha first, then Zebra.
    expect(roots[0].rendering?.displayName).toBe('Alpha');
    expect(roots[1].rendering?.displayName).toBe('Zebra');
  });

  it('promotes an existing leaf to a folder when a deeper path arrives later, dropping the leaf', () => {
    // Sample arrives first as a leaf, then Sample/Sample Rendering arrives.
    // Sample must transition leaf -> folder. The original Sample item is
    // dropped (no "ghost" self-named leaf) because such items are almost
    // always folder-template containers regardless of their declared template.
    const sample = rm({ id: '{S}', displayName: 'Sample', path: '/p/q/Sample' });
    const sampleChild = rm({ id: '{SC}', displayName: 'Sample Rendering', path: '/p/q/Sample/Sample Rendering' });
    const roots = buildRenderingTree([sample, sampleChild]);
    expect(roots).toHaveLength(1);
    const sampleNode = roots[0];
    expect(sampleNode.segment).toBe('Sample');
    expect(sampleNode.isLeaf).toBe(false);
    expect(sampleNode.rendering).toBeUndefined();
    expect(sampleNode.children.map(c => c.rendering?.id)).toEqual(['{SC}']);
  });

  it('drops a leaf colliding with an existing folder (no ghost self-leaves)', () => {
    // Folder created first by descending child path, then a leaf item arrives
    // at the same folder path. The leaf is dropped (the folder wins).
    const formsLeaf = rm({ id: '{F1}', displayName: 'Forms', path: '/p/q/Forms' });
    const formsChild = rm({ id: '{F2}', displayName: 'Subscribe', path: '/p/q/Forms/Subscribe' });
    const roots = buildRenderingTree([formsChild, formsLeaf]);
    expect(roots).toHaveLength(1);
    const forms = roots[0];
    expect(forms.segment).toBe('Forms');
    expect(forms.isLeaf).toBe(false);
    expect(forms.children.map(c => c.rendering?.id)).toEqual(['{F2}']);
  });

  it('treats folder-template items as folders even when they have no children', () => {
    // Modules item exists but has no descendants in the input. A regular
    // rendering would render as a leaf, but a folder-template item should
    // render as an (empty) folder.
    const modulesAsFolder = rm({
      id: '{M}', displayName: 'Modules', path: '/p/Modules',
      template: RENDERING_FOLDER_TEMPLATE,
    });
    const otherLeaf = rm({ id: '{O}', displayName: 'Other', path: '/p/Other' });
    const roots = buildRenderingTree([modulesAsFolder, otherLeaf]);
    const mods = roots.find(r => r.segment === 'Modules')!;
    expect(mods.isLeaf).toBe(false);
    expect(mods.rendering).toBeUndefined();
    expect(mods.children).toEqual([]);
  });

  it('folders and leaves intermix purely by sortOrder + name (no folders-first)', () => {
    // Leaf 'Aaa' and folder 'Bbb' - alphabetically Aaa comes first.
    // Under the old folders-first rule the folder would have been hoisted;
    // now it stays in natural sort position.
    const items = [
      rm({ id: '{R1}', displayName: 'Aaa', path: '/sitecore/layout/Renderings/Project/Aaa' }),
      rm({ id: '{R2}', displayName: 'Bbb', path: '/sitecore/layout/Renderings/Project/Bbb', template: RENDERING_FOLDER_TEMPLATE }),
      rm({ id: '{R3}', displayName: 'BbbChild', path: '/sitecore/layout/Renderings/Project/Bbb/Child' }),
    ];
    const tree = buildRenderingTree(items);
    // Common prefix is /sitecore/layout/Renderings/Project; root has Aaa (leaf) and Bbb (folder).
    expect(tree).toHaveLength(2);
    expect(tree[0].segment).toBe('Aaa');  // leaf, alphabetically first
    expect(tree[0].isLeaf).toBe(true);
    expect(tree[1].segment).toBe('Bbb');  // folder
    expect(tree[1].isLeaf).toBe(false);
  });

  it('respects sortOrder over alphabetical order', () => {
    // Zed has sortOrder 10, Alpha has sortOrder 200 - Zed must come first.
    const zed = rm({ id: '{Z}', displayName: 'Zed', path: '/p/q/Zed', sortOrder: 10 });
    const alpha = rm({ id: '{A}', displayName: 'Alpha', path: '/p/q/Alpha', sortOrder: 200 });
    const roots = buildRenderingTree([zed, alpha]);
    expect(roots).toHaveLength(2);
    expect(roots[0].segment).toBe('Zed');
    expect(roots[1].segment).toBe('Alpha');
  });
});
