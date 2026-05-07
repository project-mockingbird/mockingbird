/** A single rendering extracted from __Final Renderings XML. */
export interface RenderingEntry {
  uid: string;
  renderingId: string;
  placeholder: string;
  dataSource: string;
  params: Record<string, string>;
  /**
   * Sitecore path of the item whose __Final Renderings this entry came from.
   * Used as the resolution root for `local:` datasource references — a partial
   * design's renderings must resolve `local:` paths relative to the partial,
   * not the page. Set by the composer after parseRenderingXml; undefined when
   * the entry was not tagged (callers should fall back to the page path).
   */
  ownerItemPath?: string;
  /**
   * Parsed `<rls>/<ruleset>/<rule>` data on the rendering, populated by
   * `parseRenderingXml` when the body carries rules.
   * `applyDefaultRulePersonalization` (in `personalization.ts`) is the
   * sole consumer — it reads `rules.defaultActionDataSource` and mutates
   * `dataSource` in place, mirroring Sitecore's
   * `InsertRenderings.Personalization` processor (0.4.0.9).
   */
  rules?: {
    /**
     * GUID extracted from
     * `<rule uid="{00000000-...}">/<actions>/<action s:DataSource="{GUID}">`,
     * normalized lowercase-dashed. `undefined` when the rule is present
     * but carries no action datasource.
     */
    defaultActionDataSource?: string;
  };
  /**
   * 0.4.0.14 — Set by `parseRenderingXml` when the default rule's `<actions>`
   * block contains a `HideRenderingAction`. Consumers (component-resolver)
   * emit the experience-stub shape `{uid, componentName:null, dataSource:null,
   * experiences:{}}` for these renderings, matching Sitecore's
   * `ExperiencesJsonRenderingProcessor.SetResult`
   * (`Sitecore.LayoutService.Personalization.decompiled.cs:270-291`).
   */
  hidden?: boolean;
}

/** Nested placeholder node — intermediate representation before GUID resolution. */
export interface PlaceholderNode {
  uid: string;
  renderingId: string;
  dataSource: string;
  params: Record<string, string>;
  ownerItemPath?: string;
  placeholders?: Record<string, PlaceholderNode[]>;
  /**
   * 0.4.0.14 — Forwarded from `RenderingEntry.hidden` by the placeholder tree
   * builder. Emission-side consumers check this flag before resolving fields/
   * placeholders.
   */
  hidden?: boolean;
}

/** Resolved component with name, formatted fields, and nested placeholders. */
export interface ComponentNode {
  uid: string;
  /**
   * `null` for hidden-by-default renderings per Sitecore's
   * `ExperiencedRenderedJsonRendering` shape (P3b, 0.4.0.14).
   */
  componentName: string | null;
  /**
   * `null` for hidden-by-default renderings (P3b, 0.4.0.14).
   */
  dataSource: string | null;
  /**
   * Empty for hidden-by-default stubs; omitted from emission when not set.
   * 0.4.0.14 changed this from required-always-emitted to optional.
   */
  params?: Record<string, string>;
  /**
   * 0.4.0.14 — Optional per Sitecore's emission contract. Absent when no
   * datasource AND no context-item resolver (`fields` key dropped from JSON).
   * Present (even as `{}`) when RCR resolved a context item. `{ data: ... }`
   * for ComponentQuery-driven renderings. `{ items: [...] }` for
   * ItemSelectorQuery RCRs. See
   * `Sitecore.LayoutService.decompiled.cs:2686-2689`.
   */
  fields?: Record<string, JssFieldValue>;
  placeholders?: Record<string, ComponentNode[]>;
  /**
   * 0.4.0.14 — Experience-stub emission for hidden-by-default renderings.
   * Currently always emitted as `{}` when set; full variant serialization is
   * out of scope for this release.
   */
  experiences?: Record<string, unknown>;
}

/** JSS field value — text, rich text, multiline text. */
export interface JssTextField {
  value: string;
}

/** JSS image field value. */
export interface JssImageField {
  value: {
    src: string;
    alt: string;
    width: string;
    height: string;
  };
}

/** JSS general link field value. */
export interface JssLinkField {
  value: {
    href: string;
    text: string;
    anchor: string;
    linktype: string;
    class: string;
    title: string;
    target: string;
    querystring: string;
    id: string;
  };
}

/** JSS checkbox field value. */
export interface JssCheckboxField {
  value: boolean;
}

/** JSS number field value. */
export interface JssNumberField {
  value: number;
}

/** A single referenced item in a multilist/treelist field. */
export interface JssReferenceItem {
  id: string;
  url: string;
  name: string;
  displayName: string;
  fields: Record<string, JssFieldValue>;
}

/** Union of all possible JSS field shapes. */
export type JssFieldValue =
  | JssTextField
  | JssImageField
  | JssLinkField
  | JssCheckboxField
  | JssNumberField
  | JssReferenceItem[]
  | JssReferenceItem
  | null;

/** Full layout route — matches the sitecore.route shape from JSS GraphQL layout query. */
export interface LayoutRoute {
  name: string;
  displayName: string;
  fields: Record<string, JssFieldValue>;
  databaseName: string;
  deviceId: string;
  itemId: string;
  itemLanguage: string;
  itemVersion: number;
  layoutId: string;
  templateId: string;
  templateName: string;
  placeholders: Record<string, ComponentNode[]>;
}
