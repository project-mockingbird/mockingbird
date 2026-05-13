/**
 * SCS allowedPushOperations values, in order of "ownership strength" over
 * the items the include covers. CreateOnly is bootstrap-only (the items
 * seed once and yield to any stronger layer for ongoing edits).
 * CreateUpdateAndDelete is full ownership.
 */
export type AllowedPushOperations =
  | 'CreateOnly'
  | 'CreateAndUpdate'
  | 'CreateUpdateAndDelete';

const STRENGTH: Record<AllowedPushOperations, number> = {
  CreateOnly: 0,
  CreateAndUpdate: 1,
  CreateUpdateAndDelete: 2,
};

/**
 * Numeric strength for an allowedPushOperations value. `undefined` is treated
 * as 'CreateAndUpdate' (SCS's default when the field is omitted).
 */
export function pushOpStrength(op: AllowedPushOperations | undefined): number {
  if (op === undefined) return STRENGTH.CreateAndUpdate;
  return STRENGTH[op];
}

/**
 * Standard Array.sort comparator. Negative when `a` is weaker than `b`,
 * positive when stronger, 0 when equal.
 */
export function comparePushOps(
  a: AllowedPushOperations | undefined,
  b: AllowedPushOperations | undefined,
): number {
  return pushOpStrength(a) - pushOpStrength(b);
}

/**
 * One activated layer in a workspace - a single sitecore.json plus its
 * presentation metadata (name + color for the UI). The engine treats N
 * LayerSpec values as the workspace's full layer set.
 */
export interface LayerSpec {
  /** Absolute path to the sitecore.json file for this layer. */
  sitecoreJsonPath: string;
  /** Display name (e.g. "authoring", "content"). */
  name: string;
  /** Optional color hex for the UI. */
  color?: string;
}
