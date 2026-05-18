import type { Engine } from '../index.js';

/**
 * The Sitecore field types Mockingbird's RenderFieldPipeline port handles
 * directly. Everything else falls through `renderField` unchanged - the
 * per-type serializers in `field-json-value.ts` decide what (if anything)
 * to do with a non-renderable field.
 *
 * Matches the subset of Sitecore field types that drive visible parity
 * divergences against prod Edge: Image + General Link go through attr-
 * walking serializers (ImageFieldSerializer / GeneralLinkFieldSerializer);
 * Rich Text goes through a raw-HTML pass with DynamicLinkDatabaseSwitcher
 * token rewriting (RichTextFieldSerializer). Phase A ships stubs for the
 * first two; Rich Text arrives in Phase C.
 */
export type RenderFieldType = 'image' | 'general-link' | 'rich-text';

/**
 * Inputs to `renderField`. The pipeline consumes raw authored field XML
 * and context (engine for item lookups, siteRootPath + mediaBaseUrl for
 * URL projection) and returns rendered HTML. The serializers downstream
 * walk that HTML to produce `jsonValue.value`.
 */
export interface FieldRenderArgs {
  fieldType: RenderFieldType;
  value: string;
  engine: Engine;
  siteRootPath: string;
  mediaBaseUrl: string;
}

/**
 * A single stage in the RenderFieldPipeline. `appliesTo` is the dispatch
 * check - first matching processor wins. `render` returns the HTML string
 * that the field serializer will walk. Empty string signals "nothing to
 * render" (unresolvable mediaid, empty field value, etc.) - callers map
 * that to the type-appropriate empty jsonValue (`{value:{}}` for image,
 * `{value:{href:''}}` for link).
 */
export interface FieldRendererProcessor {
  appliesTo: (args: FieldRenderArgs) => boolean;
  render: (args: FieldRenderArgs) => string;
}
