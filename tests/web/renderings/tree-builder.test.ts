import { describe, expect, it } from 'vitest';
import { buildTree } from '../../../src/web/components/detail/field-editors/renderings/tree-builder';
import type { RenderingEntry, TreeNode, TreePlaceholderNode, TreeRenderingNode } from '../../../src/web/components/detail/field-editors/renderings/types';

function entry(over: Partial<RenderingEntry> & { placeholder: string; uid: string; renderingId: string }): RenderingEntry {
  return {
    uid: over.uid,
    renderingId: over.renderingId,
    placeholder: over.placeholder,
    dataSource: over.dataSource ?? '',
    params: over.params ?? {},
    rlsRaw: over.rlsRaw,
  };
}

/** Shorthand: discovered path with no specific owner (the common test case). */
function p(value: string): { value: string } {
  return { value };
}

/** Shorthand: discovered path with an explicit owner UID. */
function owned(value: string, ownerUid: string): { value: string; ownerUid: string } {
  return { value, ownerUid };
}

function findPh(nodes: TreeNode[], path: string): TreePlaceholderNode | undefined {
  for (const n of nodes) {
    if (n.kind === 'placeholder') {
      if (n.path === path) return n;
      const found = findPh(n.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

describe('buildTree', () => {
  it('returns an empty array for empty input', () => {
    expect(buildTree({ entries: [], discoveredPaths: [] })).toEqual([]);
  });

  it('builds a single chain from a single rendering at a single path', () => {
    const e = entry({
      uid: '{U1}',
      renderingId: '{R1}',
      placeholder: '/headless-main/sxa-full-width-body/container-1',
    });
    const roots = buildTree({ entries: [e], discoveredPaths: [] });
    expect(roots).toHaveLength(1);
    const headlessMain = roots[0] as TreePlaceholderNode;
    expect(headlessMain.kind).toBe('placeholder');
    expect(headlessMain.segment).toBe('headless-main');
    expect(headlessMain.path).toBe('/headless-main');
    expect(headlessMain.children).toHaveLength(1);
    const sxa = headlessMain.children[0] as TreePlaceholderNode;
    expect(sxa.segment).toBe('sxa-full-width-body');
    expect(sxa.children).toHaveLength(1);
    const container1 = sxa.children[0] as TreePlaceholderNode;
    expect(container1.segment).toBe('container-1');
    expect(container1.children).toHaveLength(1);
    expect(container1.children[0]).toEqual({ kind: 'rendering', entry: e, children: [] });
  });

  it('keeps two siblings at the same path in input order', () => {
    const a = entry({ uid: '{A}', renderingId: '{R}', placeholder: '/a' });
    const b = entry({ uid: '{B}', renderingId: '{R}', placeholder: '/a' });
    const roots = buildTree({ entries: [a, b], discoveredPaths: [] });
    const ph = findPh(roots, '/a')!;
    expect(ph.children).toHaveLength(2);
    expect(ph.children[0]).toEqual({ kind: 'rendering', entry: a, children: [] });
    expect(ph.children[1]).toEqual({ kind: 'rendering', entry: b, children: [] });
  });

  it('shares a parent for two paths with a common prefix', () => {
    const e1 = entry({ uid: '{1}', renderingId: '{R}', placeholder: '/foo/bar' });
    const e2 = entry({ uid: '{2}', renderingId: '{R}', placeholder: '/foo/baz' });
    const roots = buildTree({ entries: [e1, e2], discoveredPaths: [] });
    expect(roots).toHaveLength(1);
    const foo = roots[0] as TreePlaceholderNode;
    expect(foo.path).toBe('/foo');
    const bar = findPh([foo], '/foo/bar')!;
    const baz = findPh([foo], '/foo/baz')!;
    expect(bar).toBeDefined();
    expect(baz).toBeDefined();
    expect(bar.children).toEqual([{ kind: 'rendering', entry: e1, children: [] }]);
    expect(baz.children).toEqual([{ kind: 'rendering', entry: e2, children: [] }]);
  });

  it('produces two separate root chains for paths with no common prefix', () => {
    const e1 = entry({ uid: '{1}', renderingId: '{R}', placeholder: '/foo/x' });
    const e2 = entry({ uid: '{2}', renderingId: '{R}', placeholder: '/bar/y' });
    const roots = buildTree({ entries: [e1, e2], discoveredPaths: [] });
    const segments = roots.map(r => (r as TreePlaceholderNode).segment).sort();
    expect(segments).toEqual(['bar', 'foo']);
  });

  it('renders a discovered empty placeholder as a leaf alongside referenced ones', () => {
    const e = entry({ uid: '{1}', renderingId: '{R}', placeholder: '/p/a' });
    const roots = buildTree({
      entries: [e],
      discoveredPaths: [p('/p/a'), p('/p/b')],
    });
    const ph = findPh(roots, '/p')!;
    const a = findPh([ph], '/p/a')!;
    const b = findPh([ph], '/p/b')!;
    expect(a.children).toHaveLength(1); // the rendering
    expect(b.children).toHaveLength(0); // empty
  });

  it('renders a discovered path with no entries as an empty chain', () => {
    const roots = buildTree({ entries: [], discoveredPaths: [p('/x/y')] });
    const x = roots[0] as TreePlaceholderNode;
    expect(x.path).toBe('/x');
    expect(x.children).toHaveLength(1);
    expect((x.children[0] as TreePlaceholderNode).path).toBe('/x/y');
  });

  it('preserves document order for renderings within their placeholder', () => {
    const a = entry({ uid: '{A}', renderingId: '{R}', placeholder: '/p' });
    const b = entry({ uid: '{B}', renderingId: '{R}', placeholder: '/p' });
    const c = entry({ uid: '{C}', renderingId: '{R}', placeholder: '/p' });
    const roots = buildTree({ entries: [c, a, b], discoveredPaths: [] });
    const ph = findPh(roots, '/p')!;
    expect(ph.children.map(n => (n as TreeRenderingNode).entry.uid))
      .toEqual(['{C}', '{A}', '{B}']);
  });

  it('sorts sibling placeholders lexicographically by segment', () => {
    const roots = buildTree({
      entries: [],
      discoveredPaths: [p('/p/zeta'), p('/p/alpha'), p('/p/mu')],
    });
    const ph = roots[0] as TreePlaceholderNode;
    const segments = ph.children.map(c => (c as TreePlaceholderNode).segment);
    expect(segments).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('places renderings before child placeholders within the same parent', () => {
    const e = entry({ uid: '{1}', renderingId: '{R}', placeholder: '/p' });
    const child = entry({ uid: '{2}', renderingId: '{R}', placeholder: '/p/q' });
    const roots = buildTree({ entries: [e, child], discoveredPaths: [] });
    const ph = roots[0] as TreePlaceholderNode;
    expect(ph.children[0].kind).toBe('rendering');
    expect(ph.children[1].kind).toBe('placeholder');
  });

  it('does not duplicate a placeholder when an ancestor path is also discovered', () => {
    const e = entry({ uid: '{1}', renderingId: '{R}', placeholder: '/a/b/c' });
    const roots = buildTree({
      entries: [e],
      discoveredPaths: [p('/a'), p('/a/b'), p('/a/b/c')],
    });
    const a = roots[0] as TreePlaceholderNode;
    expect(a.children).toHaveLength(1);
    const b = a.children[0] as TreePlaceholderNode;
    expect(b.children).toHaveLength(1);
    const c = b.children[0] as TreePlaceholderNode;
    expect(c.children).toHaveLength(1);
    expect(c.children[0].kind).toBe('rendering');
  });

  it('drops entries with empty or missing placeholder paths', () => {
    const ok = entry({ uid: '{OK}', renderingId: '{R}', placeholder: '/p' });
    const bad = entry({ uid: '{BAD}', renderingId: '{R}', placeholder: '' });
    const roots = buildTree({ entries: [ok, bad], discoveredPaths: [] });
    const ph = roots[0] as TreePlaceholderNode;
    expect(ph.children).toHaveLength(1);
    expect((ph.children[0] as TreeRenderingNode).entry.uid).toBe('{OK}');
  });

  describe('engine-attributed ownership', () => {
    it('nests an exposed placeholder under its owning rendering when ownerUid is provided', () => {
      const container = entry({
        uid: '{C}',
        renderingId: '{R-CONT}',
        placeholder: '/main',
      });
      const roots = buildTree({
        entries: [container],
        discoveredPaths: [owned('/main/container-6', '{C}')],
      });
      const main = roots[0] as TreePlaceholderNode;
      expect(main.path).toBe('/main');
      expect(main.children).toHaveLength(1);
      const rendNode = main.children[0] as TreeRenderingNode;
      expect(rendNode.entry.uid).toBe('{C}');
      // container-6 nests under the Container, not as a sibling at /main
      expect(rendNode.children).toHaveLength(1);
      expect(rendNode.children[0].path).toBe('/main/container-6');
    });

    it('nests grandchild renderings under the claimed placeholder', () => {
      const container = entry({
        uid: '{C}',
        renderingId: '{R-CONT}',
        placeholder: '/main',
      });
      const grandchild = entry({
        uid: '{G}',
        renderingId: '{R-IMG}',
        placeholder: '/main/container-6',
      });
      const roots = buildTree({
        entries: [container, grandchild],
        discoveredPaths: [owned('/main/container-6', '{C}')],
      });
      const main = roots[0] as TreePlaceholderNode;
      const rendNode = main.children.find(c => c.kind === 'rendering') as TreeRenderingNode;
      expect(rendNode.children).toHaveLength(1);
      const c6 = rendNode.children[0];
      expect(c6.path).toBe('/main/container-6');
      // The grandchild rendering is inside container-6
      expect(c6.children).toHaveLength(1);
      expect((c6.children[0] as TreeRenderingNode).entry.uid).toBe('{G}');
    });

    it('does not claim a discovered path when ownerUid is missing', () => {
      const c = entry({ uid: '{C}', renderingId: '{R}', placeholder: '/main' });
      const roots = buildTree({
        entries: [c],
        discoveredPaths: [p('/main/container-1')], // no ownerUid
      });
      const main = roots[0] as TreePlaceholderNode;
      // container-1 attaches to /main as a sibling of the rendering, not under it.
      expect(main.children).toHaveLength(2);
      const rend = main.children.find(n => n.kind === 'rendering') as TreeRenderingNode;
      expect(rend.children).toHaveLength(0);
    });

    it('claims multiple exposed paths owned by the same rendering', () => {
      const splitter = entry({
        uid: '{S}', renderingId: '{R-SPL}', placeholder: '/main',
      });
      const roots = buildTree({
        entries: [splitter],
        discoveredPaths: [
          owned('/main/left-4', '{S}'),
          owned('/main/right-4', '{S}'),
        ],
      });
      const main = roots[0] as TreePlaceholderNode;
      const rendNode = main.children[0] as TreeRenderingNode;
      const claimed = rendNode.children.map(c => c.path).sort();
      expect(claimed).toEqual(['/main/left-4', '/main/right-4']);
    });

    it('does NOT claim a discovered path attributed to another rendering by ownerUid', () => {
      // The bug case: a Spotlight at /main/container-1/container-1 has DPI=2
      // but does not actually expose container-2. The engine attributes
      // container-2 to a different rendering (or none). The tree-builder must
      // not over-claim based on shape alone.
      const containerA = entry({
        uid: '{A}', renderingId: '{R-CONT}', placeholder: '/main',
      });
      const spotlight = entry({
        uid: '{SPOT}', renderingId: '{R-SPOT}',
        placeholder: '/main/container-1',
      });
      const roots = buildTree({
        entries: [containerA, spotlight],
        // The engine attributes container-1 to A (correct - A exposes it).
        // It does NOT attribute /main/container-1/container-2 to anyone.
        discoveredPaths: [
          owned('/main/container-1', '{A}'),
          p('/main/container-1/container-2'),
        ],
      });
      const main = roots[0] as TreePlaceholderNode;
      const aNode = main.children.find(n => n.kind === 'rendering' && (n as TreeRenderingNode).entry.uid === '{A}') as TreeRenderingNode;
      // A claims its container-1
      expect(aNode.children).toHaveLength(1);
      expect(aNode.children[0].path).toBe('/main/container-1');
      // The container-2 grandchild attaches under container-1 via prefix, NOT
      // under the Spotlight (which has no ownerUid attributed).
      const c1 = aNode.children[0];
      const spotInsideC1 = c1.children.find(n => n.kind === 'rendering' && (n as TreeRenderingNode).entry.uid === '{SPOT}') as TreeRenderingNode;
      expect(spotInsideC1).toBeDefined();
      // Spotlight has no children claimed
      expect(spotInsideC1.children).toEqual([]);
      // container-2 attaches to container-1 (its prefix parent), not to the Spotlight
      const c2 = c1.children.find(n => n.kind === 'placeholder' && (n as TreePlaceholderNode).path === '/main/container-1/container-2');
      expect(c2).toBeDefined();
    });
  });

  // version 5: 6 renderings across 4 placeholder paths
  it('builds the b-test v5 content tree shape correctly', () => {
    const accordion = entry({
      uid: '{47ACAE0E-79A6-4C04-B66C-D26C5C9A6E03}',
      renderingId: '{4B5A6F21-7745-4657-9643-6D660223CBC9}',
      placeholder: '/headless-main/sxa-full-width-body/container-1/container-1',
    });
    const container = entry({
      uid: '{B0CD7880-3291-474B-AB5B-8D3961B1C731}',
      renderingId: '{441E249E-82B1-46B0-84AE-181AC1A8CEE9}',
      placeholder: '/headless-main/sxa-full-width-body/container-1',
    });
    const text = entry({
      uid: '{D19DD8A2-75D1-4537-9AA9-5A80419C27B0}',
      renderingId: '{9C6D53E3-FE57-4638-AF7B-6D68304C7A94}',
      placeholder: '/headless-main/sxa-full-width-body/container-1/container-1/accordion-0-0-2',
    });
    const image = entry({
      uid: '{82FC0EC7-682F-4026-940B-F088B4B2BC45}',
      renderingId: '{AB2EDBA0-3960-4F12-B765-579DC231894A}',
      placeholder: '/headless-main/sxa-full-width-body/container-1/container-1/accordion-0-0-2',
    });
    const richText = entry({
      uid: '{042DFF99-D4C3-4BB8-A4F0-2A32D694C289}',
      renderingId: '{3836D951-BB14-43AC-9231-649B7F245DC5}',
      placeholder: '/headless-main/sxa-full-width-body/container-1/container-1/accordion-1-0-2',
    });
    const title = entry({
      uid: '{0AE97FE0-D301-4132-9643-EE987F864AD3}',
      renderingId: '{69F62D06-37C8-4308-ACA9-894D14E23D0F}',
      placeholder: '/headless-main/sxa-full-width-body/container-1/container-1/accordion-1-0-2',
    });
    const roots = buildTree({
      entries: [accordion, container, text, image, richText, title],
      discoveredPaths: [],
    });
    expect(roots).toHaveLength(1);
    const headlessMain = roots[0] as TreePlaceholderNode;
    expect(headlessMain.segment).toBe('headless-main');
    const sxa = headlessMain.children[0] as TreePlaceholderNode;
    const c1 = sxa.children[0] as TreePlaceholderNode;
    expect(c1.segment).toBe('container-1');
    expect(c1.children.filter(c => c.kind === 'rendering')).toHaveLength(1);
    expect(c1.children.filter(c => c.kind === 'placeholder')).toHaveLength(1);
    const c1c1 = findPh([c1], '/headless-main/sxa-full-width-body/container-1/container-1')!;
    expect(c1c1.children.filter(c => c.kind === 'rendering')).toHaveLength(1);
    expect(c1c1.children.filter(c => c.kind === 'placeholder')).toHaveLength(2);
    const a002 = findPh([c1c1], '/headless-main/sxa-full-width-body/container-1/container-1/accordion-0-0-2')!;
    expect(a002.children.filter(c => c.kind === 'rendering')).toHaveLength(2);
    const a102 = findPh([c1c1], '/headless-main/sxa-full-width-body/container-1/container-1/accordion-1-0-2')!;
    expect(a102.children.filter(c => c.kind === 'rendering')).toHaveLength(2);
  });

  it('normalises paths with trailing slashes and double slashes', () => {
    const e1 = entry({ uid: '{1}', renderingId: '{R}', placeholder: '/p/q/' });
    const e2 = entry({ uid: '{2}', renderingId: '{R}', placeholder: '/p//q' });
    const roots = buildTree({ entries: [e1, e2], discoveredPaths: [] });
    expect(roots).toHaveLength(1);
    const ph = roots[0] as TreePlaceholderNode;
    expect(ph.path).toBe('/p');
    expect(ph.children).toHaveLength(1);
    const q = ph.children[0] as TreePlaceholderNode;
    expect(q.path).toBe('/p/q');
    expect(q.children).toHaveLength(2);
    expect((q.children[0] as TreeRenderingNode).entry.uid).toBe('{1}');
    expect((q.children[1] as TreeRenderingNode).entry.uid).toBe('{2}');
  });
});
