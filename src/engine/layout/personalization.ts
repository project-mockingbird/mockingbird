import type { RenderingEntry } from './types.js';

/**
 * Port of Sitecore's `Sitecore.Pipelines.InsertRenderings.Personalization`
 * processor (decompile at `Sitecore.Personalization.decompiled.cs:612-686`).
 * Walks `RenderingEntry[]` and, for each entry carrying a default-uid
 * rule with `<action s:DataSource="...">`, mutates `entry.dataSource` in
 * place with the rule's action datasource.
 *
 * Sitecore's Kernel, when evaluating a default-uid rule
 * (`{00000000-...}`), overrides the declared condition with
 * `TrueCondition<...>` and runs `RunFirstMatching` - so the default
 * rule's action always applies. See decompile at
 * `Sitecore.Personalization.decompiled.cs:716-723`.
 *
 * The reference content tree contains only default-named rules (verified via
 * exhaustive grep across tenant partial designs), so this minimal
 * implementation covers every personalization-driven datasource
 * substitution the content tree needs. A full rules-engine condition-predicate
 * evaluator (for non-default rules with real conditions, `HideAction`,
 * variant renderings, etc.) is out of scope - deferred alongside other
 * 0.4.0.x items.
 *
 * Mutation matches Sitecore exactly: `rule.Apply(ruleContext)` mutates
 * `RenderingReference.DataSource` in place (confirmed at
 * `Sitecore.LayoutService.Personalization.decompiled.cs:296-321` where
 * `RenderExperiences` saves and restores the field around each rule apply).
 */
export function applyDefaultRulePersonalization(entries: RenderingEntry[]): void {
  for (const entry of entries) {
    const ruleDs = entry.rules?.defaultActionDataSource;
    if (ruleDs) entry.dataSource = ruleDs;
  }
}
