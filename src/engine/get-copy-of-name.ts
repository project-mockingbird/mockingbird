/**
 * Sitecore-parity port of `Sitecore.Data.Items.ItemUtil.GetCopyOfName`.
 *
 * Decompile reference (10.4):
 *   if (destination.Axes.GetChild(name) != null) {
 *     name = "Copy of " + originalName;
 *     int n = 1;
 *     while (destination.Axes.GetChild(name) != null) {
 *       name = "Copy of " + originalName + " " + n;
 *       n++;
 *     }
 *   }
 *
 * Lookup is case-insensitive (Sitecore's Axes.GetChild matches names
 * irrespective of casing).
 */
export function getCopyOfName(siblings: readonly string[], name: string): string {
  const taken = new Set(siblings.map(s => s.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;

  const base = `Copy of ${name}`;
  if (!taken.has(base.toLowerCase())) return base;

  for (let n = 1; n < 10_000; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}
