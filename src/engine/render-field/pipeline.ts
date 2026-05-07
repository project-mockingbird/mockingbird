import type { FieldRenderArgs, FieldRendererProcessor } from './types.js';
import { renderImageStub } from './processors/image-stub.js';
import { renderLinkStub } from './processors/link-stub.js';

/**
 * Ordered processor chain. First `appliesTo` match wins — mirrors the
 * configured processor list in Sitecore's `cm-config.txt` `renderField`
 * pipeline, where `ImageRendererFieldProcessor` /
 * `LinkRendererFieldProcessor` / `RichTextRendererFieldProcessor` each
 * claim one field type.
 *
 * Phase A ships stubs for Image and General Link; they produce the same
 * rendered-HTML shape that 0.3.7's per-item walk would have emitted as
 * direct jsonValue.value keys — so downstream parity is unchanged. Phase
 * B replaces these with full SXA-processor behavior (media-item
 * projection for alt/width/height, CDN host injection on src, etc.).
 * Phase C adds Rich Text with `DynamicLinkDatabaseSwitcher`.
 */
const PROCESSORS: FieldRendererProcessor[] = [
  { appliesTo: a => a.fieldType === 'image', render: renderImageStub },
  { appliesTo: a => a.fieldType === 'general-link', render: renderLinkStub },
];

/**
 * Port of `Sitecore.Pipelines.RenderField.RenderFieldPipeline`. Given the
 * authored field value + context, returns the HTML that
 * `FieldRenderer.RenderField` would have produced. Downstream serializers
 * (`ImageFieldSerializer.ParseRenderedImage`,
 * `GeneralLinkFieldSerializer.GetLinkProperties`) then walk the attrs via
 * {@link import('./html-walker.js').walkElementAttrs}.
 *
 * Returns `""` when no processor applies or when the processor couldn't
 * render (unresolvable media reference, empty field value, etc.). Callers
 * map that to the type-appropriate empty jsonValue (`{value:{}}` for
 * image, `{value:{href:''}}` for link).
 */
export function renderField(args: FieldRenderArgs): string {
  for (const proc of PROCESSORS) {
    if (proc.appliesTo(args)) return proc.render(args);
  }
  return '';
}
