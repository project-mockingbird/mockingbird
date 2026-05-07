import { describe, it, expect } from 'vitest';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

describe('ItemTree', () => {
  it('adds an item and retrieves it by ID', () => {
    const tree = new ItemTree();
    const item = makeItem({ id: 'aaa', path: '/sitecore/templates/Test' });
    tree.addItem(item, '/fake/path.yml');
    const node = tree.getById('aaa');
    expect(node).toBeDefined();
    expect(node!.item.path).toBe('/sitecore/templates/Test');
    expect(node!.filePath).toBe('/fake/path.yml');
  });

  it('looks up by ID case-insensitively and ignores braces', () => {
    const tree = new ItemTree();
    const id = '441e249e-82b1-46b0-84ae-181ac1a8cee9';
    tree.addItem(makeItem({ id, path: '/sitecore/layout/Renderings/Container' }), '/c.yml');
    expect(tree.getById(id)).toBeDefined();
    expect(tree.getById(id.toUpperCase())).toBe(tree.getById(id));
    expect(tree.getById(`{${id.toUpperCase()}}`)).toBe(tree.getById(id));
  });

  it('retrieves items by Sitecore path', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({ id: 'aaa', path: '/sitecore/templates/Test' }), '/a.yml');
    const node = tree.getByPath('/sitecore/templates/Test');
    expect(node).toBeDefined();
    expect(node!.item.id).toBe('aaa');
  });

  it('builds parent-child relationships when parent exists', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({ id: 'parent-id', path: '/sitecore/templates/Parent' }), '/p.yml');
    tree.addItem(makeItem({ id: 'child-id', parent: 'parent-id', path: '/sitecore/templates/Parent/Child' }), '/c.yml');
    const parentNode = tree.getById('parent-id')!;
    expect(parentNode.children.size).toBe(1);
    expect(parentNode.children.get('child-id')!.item.path).toBe('/sitecore/templates/Parent/Child');
    const childNode = tree.getById('child-id')!;
    expect(childNode.parentNode).toBe(parentNode);
  });

  it('removes an item and its children', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({ id: 'parent-id', path: '/sitecore/templates/Parent' }), '/p.yml');
    tree.addItem(makeItem({ id: 'child-id', parent: 'parent-id', path: '/sitecore/templates/Parent/Child' }), '/c.yml');
    tree.removeItem('parent-id');
    expect(tree.getById('parent-id')).toBeUndefined();
    expect(tree.getById('child-id')).toBeUndefined();
  });

  it('returns all items as a flat list', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({ id: 'a', path: '/sitecore/a' }), '/a.yml');
    tree.addItem(makeItem({ id: 'b', path: '/sitecore/b' }), '/b.yml');
    expect(tree.getAllNodes()).toHaveLength(2);
  });

  it('finds items by template', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({ id: 'a', path: '/a', template: 'template-1' }), '/a.yml');
    tree.addItem(makeItem({ id: 'b', path: '/b', template: 'template-2' }), '/b.yml');
    tree.addItem(makeItem({ id: 'c', path: '/c', template: 'template-1' }), '/c.yml');
    const results = tree.getByTemplate('template-1');
    expect(results).toHaveLength(2);
  });

  it('defers parent linking for items added before their parent', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({ id: 'child-id', parent: 'parent-id', path: '/sitecore/templates/P/C' }), '/c.yml');
    tree.addItem(makeItem({ id: 'parent-id', path: '/sitecore/templates/P' }), '/p.yml');
    tree.resolveOrphans();
    const parentNode = tree.getById('parent-id')!;
    expect(parentNode.children.size).toBe(1);
    const childNode = tree.getById('child-id')!;
    expect(childNode.parentNode).toBe(parentNode);
  });

  describe('URL-safe path lookup', () => {
    // Real Sitecore's URL pipeline (ItemResolver) translates incoming URL
    // segments to item names by reversing two transforms — case-insensitive
    // match and dash↔space. Mockingbird mirrors that here so a sitemap URL
    // like `/.../faq-item-01` resolves to an item whose on-disk name is
    // `Faq Item 01`.

    it('resolves an item-with-spaces path via the URL-safe (dashed, lowercase) form', () => {
      const tree = new ItemTree();
      tree.addItem(
        makeItem({ id: 'faq', path: '/sitecore/content/Home/faqs/Faq Item 01' }),
        '/x.yml',
      );
      const node = tree.getByPath('/sitecore/content/home/faqs/faq-item-01');
      expect(node).toBeDefined();
      expect(node!.item.id).toBe('faq');
    });

    it('resolves a mixed-case path via its lowercase URL form (regression — already supported)', () => {
      const tree = new ItemTree();
      tree.addItem(
        makeItem({ id: 'home', path: '/sitecore/content/site/Home' }),
        '/h.yml',
      );
      const node = tree.getByPath('/sitecore/content/site/home');
      expect(node).toBeDefined();
      expect(node!.item.id).toBe('home');
    });

    it('still resolves an item by its exact (with-spaces) Sitecore path', () => {
      const tree = new ItemTree();
      tree.addItem(
        makeItem({ id: 'faq', path: '/sitecore/content/Home/faqs/Faq Item 01' }),
        '/x.yml',
      );
      const node = tree.getByPath('/sitecore/content/Home/faqs/Faq Item 01');
      expect(node).toBeDefined();
      expect(node!.item.id).toBe('faq');
    });

    it('returns undefined when neither the exact nor the URL-safe form matches', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'a', path: '/sitecore/content/foo' }), '/a.yml');
      expect(tree.getByPath('/sitecore/content/does-not-exist')).toBeUndefined();
    });

    it('keeps first-added item when two siblings normalize to the same URL-safe key', () => {
      // `Foo Bar` and `foo-bar` both normalize to `foo-bar` under the URL-
      // safe transform. Sitecore's URL resolver is first-hit-wins by sort
      // order; mockingbird preserves the first item added and leaves the
      // second reachable only by its exact lowercase path.
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'spaced', path: '/sitecore/content/Foo Bar' }), '/s.yml');
      tree.addItem(makeItem({ id: 'dashed', path: '/sitecore/content/foo-bar' }), '/d.yml');

      // URL-safe lookup returns the first-added item.
      const dashedLookup = tree.getByPath('/sitecore/content/foo-bar');
      expect(dashedLookup).toBeDefined();
      // Exact lowercase still wins for the dashed item — `foo-bar` is its
      // literal lowercase path so byPath finds it before the URL-safe map.
      expect(dashedLookup!.item.id).toBe('dashed');

      // The spaced item is reachable by its exact path.
      const spacedLookup = tree.getByPath('/sitecore/content/Foo Bar');
      expect(spacedLookup).toBeDefined();
      expect(spacedLookup!.item.id).toBe('spaced');
    });

    it('removes an item from the URL-safe index when removeItem is called', () => {
      const tree = new ItemTree();
      tree.addItem(
        makeItem({ id: 'faq', path: '/sitecore/content/Home/Faq Item 01' }),
        '/x.yml',
      );
      tree.removeItem('faq');
      expect(tree.getByPath('/sitecore/content/home/faq-item-01')).toBeUndefined();
      expect(tree.getByPath('/sitecore/content/Home/Faq Item 01')).toBeUndefined();
    });

    it('updates URL-safe paths when an item is relinked under a new parent', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'p1', path: '/sitecore/content/Old Parent' }), '/p1.yml');
      tree.addItem(makeItem({ id: 'p2', path: '/sitecore/content/New Parent' }), '/p2.yml');
      tree.addItem(
        makeItem({ id: 'c', parent: 'p1', path: '/sitecore/content/Old Parent/Faq Item 01' }),
        '/c.yml',
      );

      tree.relinkItem('c', 'p2', '/sitecore/content/New Parent/Faq Item 01');

      // Old URL-safe path no longer resolves.
      expect(tree.getByPath('/sitecore/content/old-parent/faq-item-01')).toBeUndefined();
      // New URL-safe path does.
      const moved = tree.getByPath('/sitecore/content/new-parent/faq-item-01');
      expect(moved).toBeDefined();
      expect(moved!.item.id).toBe('c');
    });
  });

  describe('rebuildChildrenIndex', () => {
    // Every node's children map is rebuilt from the authoritative
    // `item.parent` pointers, canonicalising brace/case variations so
    // parent references survive mixed-SCS-serializer encoding.
    it('links a child whose parent reference is stored with braces and uppercase', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'parent-id', path: '/sitecore/templates/P' }), '/p.yml');
      // Simulate an SCS writer that stored the parent reference brace-
      // wrapped and uppercased. Mockingbird canonicalises on compare so
      // the child resolves even though `item.parent` isn't canonical.
      tree.addItem(
        makeItem({ id: 'child-id', parent: '{PARENT-ID}', path: '/sitecore/templates/P/C' }),
        '/c.yml',
      );
      tree.rebuildChildrenIndex();
      const parentAfter = tree.getById('parent-id')!;
      expect(parentAfter.children.size).toBe(1);
      const childAfter = tree.getById('child-id')!;
      expect(childAfter.parentNode).toBe(parentAfter);
      expect(tree.getOrphans()).toHaveLength(0);
    });

    it('returns all items grouped by canonical parent id — every node in byId shows up under its parent', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'p', path: '/p' }), '/p.yml');
      tree.addItem(makeItem({ id: 'a', parent: 'p', path: '/p/a' }), '/a.yml');
      tree.addItem(makeItem({ id: 'b', parent: 'P', path: '/p/b' }), '/b.yml');
      tree.addItem(makeItem({ id: 'c', parent: '{p}', path: '/p/c' }), '/c.yml');
      tree.addItem(makeItem({ id: 'd', parent: '{P}', path: '/p/d' }), '/d.yml');

      tree.rebuildChildrenIndex();

      const parent = tree.getById('p')!;
      const childIds = Array.from(parent.children.keys()).sort();
      expect(childIds).toEqual(['a', 'b', 'c', 'd']);
    });

    it('is idempotent — rebuilding twice yields the same child set', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'p', path: '/p' }), '/p.yml');
      tree.addItem(makeItem({ id: 'a', parent: 'p', path: '/p/a' }), '/a.yml');
      tree.addItem(makeItem({ id: 'b', parent: 'p', path: '/p/b' }), '/b.yml');
      tree.rebuildChildrenIndex();
      const firstIds = Array.from(tree.getById('p')!.children.keys()).sort();
      tree.rebuildChildrenIndex();
      const secondIds = Array.from(tree.getById('p')!.children.keys()).sort();
      expect(secondIds).toEqual(firstIds);
    });
  });
});

describe('ItemTree.getOrphans', () => {
  it('returns items whose parent did not resolve at addItem time', () => {
    const tree = new ItemTree();

    const childBeforeParent: ScsItem = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      parent: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      template: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/content/orphan-child',
      sharedFields: [],
      languages: [],
    };
    tree.addItem(childBeforeParent, '/tmp/child.yml');

    const orphans = tree.getOrphans();
    expect(orphans).toHaveLength(1);
    expect(orphans[0].item.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('drops items from the orphan list once their parent is added later', () => {
    const tree = new ItemTree();

    const child: ScsItem = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      parent: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      template: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/content/parent/child',
      sharedFields: [],
      languages: [],
    };
    tree.addItem(child, '/tmp/child.yml');

    expect(tree.getOrphans()).toHaveLength(1);

    const parent: ScsItem = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      parent: '00000000-0000-0000-0000-000000000000',
      template: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/content/parent',
      sharedFields: [],
      languages: [],
    };
    tree.addItem(parent, '/tmp/parent.yml');

    expect(tree.getOrphans()).toHaveLength(0);
  });

  describe('generation counter', () => {
    it('starts at 0 on a fresh tree', () => {
      const tree = new ItemTree();
      expect(tree.generation).toBe(0);
    });

    it('increments on addItem', () => {
      const tree = new ItemTree();
      const before = tree.generation;
      tree.addItem(makeItem({ id: 'a', path: '/a' }), '/a.yml');
      expect(tree.generation).toBe(before + 1);
    });

    it('increments on a successful removeItem', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'a', path: '/a' }), '/a.yml');
      const before = tree.generation;
      tree.removeItem('a');
      expect(tree.generation).toBe(before + 1);
    });

    it('does not increment on a removeItem call for an unknown id', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'a', path: '/a' }), '/a.yml');
      const before = tree.generation;
      tree.removeItem('does-not-exist');
      expect(tree.generation).toBe(before);
    });

    it('increments on relinkItem', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'p1', path: '/p1' }), '/p1.yml');
      tree.addItem(makeItem({ id: 'p2', path: '/p2' }), '/p2.yml');
      tree.addItem(makeItem({ id: 'c', parent: 'p1', path: '/p1/c' }), '/c.yml');
      const before = tree.generation;
      tree.relinkItem('c', 'p2', '/p2/c');
      expect(tree.generation).toBe(before + 1);
    });
  });

  describe('addItem idempotency (re-add of an existing id)', () => {
    it('preserves the existing children Map when re-adding the same id', () => {
      // Reproduces the file-watcher race: an in-process write
      // (copySubtree, insertItem, etc.) addItem's a parent and its child
      // in pre-order. The watcher then fires duplicate add events for the
      // same YAMLs, and depending on filesystem ordering, the parent's
      // duplicate addItem may fire AFTER the child's. Pre-fix, this
      // dropped the child from the parent's children Map.
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'p', path: '/p' }), '/p.yml');
      tree.addItem(makeItem({ id: 'c', parent: 'p', path: '/p/c' }), '/p/c.yml');
      // Sanity: child linked.
      expect(tree.getById('p')!.children.size).toBe(1);

      // Watcher fires duplicate addItem on the parent, AFTER the child.
      tree.addItem(makeItem({ id: 'p', path: '/p' }), '/p.yml');

      // Child should still be linked under the parent.
      expect(tree.getById('p')!.children.size).toBe(1);
      expect(tree.getById('p')!.children.get('c')!.item.id).toBe('c');
      // Same ItemNode identity for the child (no spurious replacement).
      expect(tree.getById('c')!.parentNode).toBe(tree.getById('p'));
    });

    it('updates item content + filePath when re-adding the same id', () => {
      const tree = new ItemTree();
      tree.addItem(
        makeItem({
          id: 'i',
          path: '/i',
          sharedFields: [{ id: 'f', hint: 'old', value: 'old' }],
        }),
        '/old.yml',
      );
      tree.addItem(
        makeItem({
          id: 'i',
          path: '/i',
          sharedFields: [{ id: 'f', hint: 'new', value: 'new' }],
        }),
        '/new.yml',
      );
      const node = tree.getById('i')!;
      expect(node.filePath).toBe('/new.yml');
      expect(node.item.sharedFields[0].value).toBe('new');
    });

    it('re-parents on re-add when item.parent changed', () => {
      const tree = new ItemTree();
      tree.addItem(makeItem({ id: 'p1', path: '/p1' }), '/p1.yml');
      tree.addItem(makeItem({ id: 'p2', path: '/p2' }), '/p2.yml');
      tree.addItem(makeItem({ id: 'c', parent: 'p1', path: '/p1/c' }), '/p1/c.yml');
      expect(tree.getById('p1')!.children.size).toBe(1);
      expect(tree.getById('p2')!.children.size).toBe(0);

      // Re-add c with a different parent.
      tree.addItem(makeItem({ id: 'c', parent: 'p2', path: '/p2/c' }), '/p2/c.yml');

      expect(tree.getById('p1')!.children.size).toBe(0);
      expect(tree.getById('p2')!.children.size).toBe(1);
      expect(tree.getById('c')!.parentNode).toBe(tree.getById('p2'));
    });
  });
});
