import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('Engine.resolveFilePath - path traversal guard', () => {
  it('resolves a normal templates path under the module include directory', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    try {
      const result = engine.resolveFilePath(
        '/sitecore/templates/Project/MyProject/Foo',
        'Foo',
      );
      const moduleTemplatesDir = resolve(FIXTURES, 'authoring/items/templates');
      expect(result.startsWith(moduleTemplatesDir + sep)).toBe(true);
    } finally {
      await engine.close();
    }
  });

  it('resolves a path with no matching include via the rootDir fallback', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    try {
      // No include matches `/sitecore/content/...` in the fixture, so we hit
      // the fallback branch - result must still stay under rootDir.
      const result = engine.resolveFilePath(
        '/sitecore/content/Home',
        'Home',
      );
      expect(result.startsWith(FIXTURES + sep)).toBe(true);
    } finally {
      await engine.close();
    }
  });

  it('rejects traversal segments that escape a matching include directory', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    try {
      // Include matches `/sitecore/templates/Project/MyProject`; the relative
      // portion would be `/../../../etc/passwd`, which after path.resolve
      // escapes the include directory.
      expect(() =>
        engine.resolveFilePath(
          '/sitecore/templates/Project/MyProject/../../../etc/passwd',
          'passwd',
        ),
      ).toThrow(/path traversal/i);
    } finally {
      await engine.close();
    }
  });

  it('rejects traversal segments via the rootDir fallback branch', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    try {
      expect(() =>
        engine.resolveFilePath(
          '/sitecore/../../../etc/passwd',
          'passwd',
        ),
      ).toThrow(/path traversal/i);
    } finally {
      await engine.close();
    }
  });

  it('rejects traversal injected via the itemName argument', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    try {
      // The itemName is appended verbatim as `${itemName}.yml`. A crafted
      // name containing `..` segments has to be rejected just as a crafted
      // path is.
      expect(() =>
        engine.resolveFilePath(
          '/sitecore/templates/Project/MyProject/Foo',
          '../../../etc/passwd',
        ),
      ).toThrow(/path traversal/i);
    } finally {
      await engine.close();
    }
  });
});
