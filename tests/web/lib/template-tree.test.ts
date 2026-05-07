import { describe, it, expect } from 'vitest';
import { buildTemplateTree } from '../../../src/web/components/tree/insert-from-template/template-tree';
import type { TemplateMeta } from '../../../src/web/lib/types';

const TEMPLATE = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const BRANCH = '35e75c72-4985-4e09-88c3-0eac6cd1e64f';
const TEMPLATE_FOLDER = '0437fee2-44c9-46a6-abe9-28858d9fee8c';

function tpl(name: string, path: string, template: string = TEMPLATE): TemplateMeta {
  return { id: `{${name.toUpperCase()}}`, name, displayName: name, path, template };
}

describe('buildTemplateTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTemplateTree([])).toEqual([]);
  });

  it('builds a tree from a single template', () => {
    const tree = buildTemplateTree([tpl('Page', '/sitecore/templates/Project/Site/Page')]);
    expect(tree).toHaveLength(1);
    // Single item: common prefix trims the parent, leaving the item itself as
    // the sole leaf at root - matching rendering-tree.ts behavior.
    const root = tree[0];
    expect(root.isLeaf).toBe(true);
    expect(root.segment).toBe('Page');
    expect(root.template?.displayName).toBe('Page');
  });

  it('marks branch templates with isBranch=true', () => {
    const tree = buildTemplateTree([
      tpl('SimpleTpl', '/sitecore/templates/Project/SimpleTpl', TEMPLATE),
      tpl('PageBranch', '/sitecore/templates/Project/PageBranch', BRANCH),
    ]);

    function findLeaf(nodes: ReturnType<typeof buildTemplateTree>, name: string): { isBranch: boolean } | null {
      for (const n of nodes) {
        if (n.isLeaf && n.template?.displayName === name) return { isBranch: !!n.template?.isBranch };
        const inner = findLeaf(n.children, name);
        if (inner) return inner;
      }
      return null;
    }

    expect(findLeaf(tree, 'SimpleTpl')?.isBranch).toBe(false);
    expect(findLeaf(tree, 'PageBranch')?.isBranch).toBe(true);
  });

  it('treats folder-templated items as folders', () => {
    const tree = buildTemplateTree([
      tpl('Project', '/sitecore/templates/Project', TEMPLATE_FOLDER),
      tpl('Foo', '/sitecore/templates/Project/Foo', TEMPLATE),
    ]);
    // Project should be a folder containing Foo.
    function flatten(nodes: ReturnType<typeof buildTemplateTree>): { path: string; isLeaf: boolean }[] {
      const out: { path: string; isLeaf: boolean }[] = [];
      for (const n of nodes) {
        out.push({ path: n.fullPath, isLeaf: n.isLeaf });
        out.push(...flatten(n.children));
      }
      return out;
    }
    const flat = flatten(tree);
    const proj = flat.find(n => n.path.endsWith('/Project'));
    expect(proj?.isLeaf).toBe(false);
  });

  it('sorts by name when sortOrder is absent (default 100 for all)', () => {
    const tree = buildTemplateTree([
      tpl('AaaTpl', '/sitecore/templates/Project/AaaTpl'),
      tpl('Folder', '/sitecore/templates/Project/Folder', TEMPLATE_FOLDER),
      tpl('FolderChild', '/sitecore/templates/Project/Folder/Child'),
    ]);
    // All three paths share /sitecore/templates/Project as the common prefix,
    // so the root contains the Project children directly. With no sortOrder
    // set, all default to 100 and ties resolve alphabetically: AaaTpl < Folder.
    expect(tree).toHaveLength(2);
    expect(tree[0].segment).toBe('AaaTpl');
    expect(tree[1].segment).toBe('Folder');
  });

  it('respects __Sortorder ascending; folders and leaves intermix', () => {
    function tplWithOrder(name: string, path: string, sortOrder: number, template: string = TEMPLATE) {
      return { ...tpl(name, path, template), sortOrder };
    }
    const tree = buildTemplateTree([
      tplWithOrder('Zebra', '/sitecore/templates/Project/Zebra', 10),
      tplWithOrder('Alpha', '/sitecore/templates/Project/Alpha', 50),
      tplWithOrder('FolderHigh', '/sitecore/templates/Project/FolderHigh', 200, TEMPLATE_FOLDER),
      tplWithOrder('FolderLow', '/sitecore/templates/Project/FolderLow', 5, TEMPLATE_FOLDER),
      tpl('Default', '/sitecore/templates/Project/Default'),
    ]);
    // Expected order: FolderLow(5), Zebra(10), Alpha(50), Default(100), FolderHigh(200).
    // Folders and leaves intermix purely by sortOrder.
    expect(tree.map(n => n.segment)).toEqual([
      'FolderLow',
      'Zebra',
      'Alpha',
      'Default',
      'FolderHigh',
    ]);
  });

  it('breaks sortOrder ties alphabetically by displayName', () => {
    function tplWithOrder(name: string, path: string, sortOrder: number) {
      return { ...tpl(name, path), sortOrder };
    }
    const tree = buildTemplateTree([
      tplWithOrder('Charlie', '/sitecore/templates/Project/Charlie', 50),
      tplWithOrder('Alpha', '/sitecore/templates/Project/Alpha', 50),
      tplWithOrder('Bravo', '/sitecore/templates/Project/Bravo', 50),
    ]);
    expect(tree.map(n => n.segment)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});
