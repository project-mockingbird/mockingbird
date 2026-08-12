import { describe, it, expect } from 'vitest';
import { spriteIconSrc } from './sprite-icon';

describe('spriteIconSrc', () => {
  it('maps a sprite path to /api/icon/<path>', () => {
    expect(spriteIconSrc('Office/32x32/folder.png')).toBe('/api/icon/Office/32x32/folder.png');
  });
  it('strips a leading -/icon/ or ~/icon/ prefix', () => {
    expect(spriteIconSrc('-/icon/Office/32x32/folder.png')).toBe('/api/icon/Office/32x32/folder.png');
    expect(spriteIconSrc('~/icon/Office/32x32/folder.png')).toBe('/api/icon/Office/32x32/folder.png');
  });
  it('returns null for media-library / CM-handler refs', () => {
    expect(spriteIconSrc('-/media/0004F621C81544F6A3A28907B4BF06D0.ashx?h=16&w=16')).toBeNull();
    expect(spriteIconSrc('~/media/ABC.ashx')).toBeNull();
    expect(spriteIconSrc('/sitecore/shell/RadControls/Editor/Skins/Monochrome/Buttons/LinkManager.gif')).toBeNull();
  });
  it('returns null for external URLs and empties', () => {
    expect(spriteIconSrc('https://example.test/x.png')).toBeNull();
    expect(spriteIconSrc('')).toBeNull();
    expect(spriteIconSrc(undefined)).toBeNull();
  });
});
