import type { ComponentNode } from './types.js';

/**
 * P3b (0.4.0.14): Build the uid-only experience-stub shape Sitecore emits
 * for renderings whose default rule contains `HideRenderingAction`. Matches
 * `Sitecore.LayoutService.Personalization.decompiled.cs:270-291`'s
 * `ExperiencedRenderedJsonRendering` shape.
 */
export function buildExperienceStub(uid: string): ComponentNode {
  return {
    uid,
    componentName: null,
    dataSource: null,
    experiences: {},
  };
}
