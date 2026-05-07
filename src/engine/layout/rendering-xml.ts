import type { RenderingEntry } from './types.js';
import { normalizeGuid } from '../guid.js';
import { HIDE_RENDERING_ACTION_ID } from '../constants.js';

export const DEFAULT_DEVICE_ID = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

/**
 * Extract the value of a named attribute from a tag string.
 * Returns empty string if the attribute is absent.
 */
function extractAttr(tag: string, name: string): string {
  // Matches name="value" or name='value'
  const re = new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`);
  const m = re.exec(tag);
  return m ? m[1] : '';
}

/**
 * Parse the s:par attribute value (key=value pairs delimited by & or &amp;)
 * into a Record<string, string>. Returns empty object for empty/missing values.
 */
function parseParams(raw: string): Record<string, string> {
  if (!raw) return {};
  // Decode &amp; to & before splitting
  const decoded = raw.replace(/&amp;/g, '&');
  const result: Record<string, string> = {};
  for (const pair of decoded.split('&')) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx);
    const value = pair.slice(eqIdx + 1);
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Parse the __Final Renderings XML field value into a flat array of RenderingEntry.
 *
 * Only renderings inside the device block matching `deviceId` are returned.
 * Order is preserved as found in the document.
 */
export function parseRenderingXml(
  xml: string,
  deviceId: string = DEFAULT_DEVICE_ID,
): RenderingEntry[] {
  if (!xml) return [];

  // Build a case-insensitive pattern for the device id (braced form)
  const escapedId = deviceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const deviceBlockRe = new RegExp(
    `<d[^>]*\\sid=["']\\{${escapedId}\\}["'][^>]*>([\\s\\S]*?)</d>`,
    'i',
  );

  const deviceMatch = deviceBlockRe.exec(xml);
  if (!deviceMatch) return [];

  const deviceBlock = deviceMatch[1];

  // Match inner <r ...> elements — they must have a uid attribute. Two
  // serialisation shapes exist:
  //   • self-closing  `<r ... />`
  //   • full-form     `<r ...><rls>...</rls></r>` — used when the rendering
  //     carries SXA personalisation rules. Both shapes must be captured, but
  //     the full-form variant is filtered against `<rls>` content below:
  //     in normal (non-editor) mode Sitecore emits only the baseline /
  //     default-rule variant of a rendering. Personalisation-audience
  //     variants — `<r>` entries whose `<rls>` carries no default rule — are
  //     editor-only and must be dropped here.
  // The outer <r> root element has `xmlns:s` / `xmlns:p` and no uid, so the
  // `uid=` requirement excludes it from the match.
  const renderingRe = /<r\s([^>]*?uid=[^>]*?)(?:\/>|>([\s\S]*?)<\/r>)/g;

  const entries: RenderingEntry[] = [];
  let m: RegExpExecArray | null;

  while ((m = renderingRe.exec(deviceBlock)) !== null) {
    const attrs = m[1];
    const body = m[2];

    if (body !== undefined && !hasDefaultOrEmptyRules(body)) {
      // Personalisation variant with only audience-specific rules — prod
      // Edge strips these in normal mode via `InsertRenderings.Personalization`
      // (`RunFirstMatching` on the ruleset). Mockingbird has no rules engine;
      // structurally discriminate by default-rule-uid presence instead.
      continue;
    }

    const uid = extractAttr(attrs, 'uid');
    const rawId = extractAttr(attrs, 's:id');
    const placeholder = extractAttr(attrs, 's:ph');
    const dataSource = extractAttr(attrs, 's:ds');
    const rawPar = extractAttr(attrs, 's:par');
    // 0.4.0.9 / 0.4.0.14: when the body carries a default-uid rule, extract
    // action metadata: datasource (0.4.0.9) and/or hidden flag (P3b, 0.4.0.14).
    const metadata = body !== undefined ? extractDefaultRuleMetadata(body) : undefined;

    const entry: RenderingEntry = {
      uid: normalizeGuid(uid),
      renderingId: normalizeGuid(rawId),
      placeholder,
      dataSource,
      params: parseParams(rawPar),
    };
    if (metadata?.rules) entry.rules = metadata.rules;
    if (metadata?.hidden) entry.hidden = true;
    entries.push(entry);
  }

  return entries;
}

/**
 * Decide whether a full-form `<r>...</r>` body represents a rendering that
 * Sitecore would KEEP in the normal layout pipeline. The rule is structural:
 *   • No `<rls>` at all                → keep (baseline rendering, no rules).
 *   • `<rls>` with default all-zeros rule uid (anywhere) → keep (default
 *     rule has a TrueCondition and fires for every visitor).
 *   • `<rls>` with only non-default rule uids → drop (personalisation
 *     variant — editor-only; prod layout service omits it).
 *
 * The default-rule uid matches both the braced form
 * `{00000000-0000-0000-0000-000000000000}` and the unbraced dashed form.
 */
function hasDefaultOrEmptyRules(body: string): boolean {
  const rlsMatch = /<rls\b[\s\S]*?<\/rls>/i.exec(body);
  if (!rlsMatch) return true;
  return /uid="\{?0{8}-0{4}-0{4}-0{4}-0{12}\}?"/i.test(rlsMatch[0]);
}

/**
 * Extract the default rule's action metadata from a full-form rendering body.
 *
 * Returns an object with:
 *   - `rules.defaultActionDataSource` when the default rule carries a
 *     `<action s:DataSource="...">` (0.4.0.9 SetDataSource path).
 *   - `hidden: true` when the default rule contains a `<action id="...">`
 *     whose id matches `HIDE_RENDERING_ACTION_ID` (P3b, 0.4.0.14).
 *   - `undefined` when the body has no default-uid rule.
 *
 * Both conditions can be set simultaneously — when Hide and SetDataSource
 * coexist on the default rule, Sitecore's `ExperiencesJsonRenderingProcessor`
 * wins: the rendering is emitted as a stub regardless of the SetDataSource
 * value. Callers treat `hidden=true` as authoritative.
 */
function extractDefaultRuleMetadata(body: string): {
  rules?: RenderingEntry['rules'];
  hidden?: boolean;
} | undefined {
  const defaultRuleRe = /<rule\b[^>]*\suid="\{?0{8}-0{4}-0{4}-0{4}-0{12}\}?"[^/>]*>([\s\S]*?)<\/rule>/i;
  const ruleMatch = defaultRuleRe.exec(body);
  if (!ruleMatch) return undefined;

  const actionsBody = ruleMatch[1];

  // Detect HideRenderingAction: `<action s:id="{25F351A1-...}">` within the
  // default rule's <actions>. Real Sitecore YAML namespaces the attribute as
  // `s:id=` (0.4.0.19 — prior `\sid=` matched only plain `id=` in test
  // fixtures, never fired on real YAML). Accept both forms so the existing
  // 0.4.0.14 plain-`id=` fixtures continue to pass. Case-insensitive, braced
  // or unbraced GUID.
  const hideActionRe = new RegExp(
    `<action\\b[^>]*\\s(?:s:)?id="\\{?${HIDE_RENDERING_ACTION_ID}\\}?"`,
    'i',
  );
  const hidden = hideActionRe.test(actionsBody);

  // Detect SetDataSource action (0.4.0.9).
  const dsMatch = /<action\b[^>]*\ss:DataSource="(\{?[0-9a-fA-F-]{32,38}\}?)"/i.exec(actionsBody);
  const rules: RenderingEntry['rules'] | undefined = dsMatch
    ? { defaultActionDataSource: normalizeGuid(dsMatch[1]) }
    : undefined;

  // Strip `rules` entirely when there's no defaultActionDataSource (undefined
  // is cleaner than `{ defaultActionDataSource: undefined }`).
  if (rules && !rules.defaultActionDataSource) {
    return hidden ? { hidden: true } : undefined;
  }

  const result: { rules?: RenderingEntry['rules']; hidden?: boolean } = {};
  if (rules) result.rules = rules;
  if (hidden) result.hidden = true;
  return Object.keys(result).length > 0 ? result : undefined;
}
