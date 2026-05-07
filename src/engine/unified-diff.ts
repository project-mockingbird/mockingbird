// src/engine/unified-diff.ts

/**
 * Line-by-line LCS-based unified diff. Sufficient for SCS YAML files,
 * which are small (a few hundred lines max). Not designed for binary or
 * very large inputs.
 *
 * Header convention follows GNU diff `--unified` output: a leading
 * "--- a/<path>" / "+++ b/<path>" pair, then one or more @@ hunks.
 * Empty input on either side substitutes "/dev/null" per `diff -N`.
 */
export function unifiedDiff(before: string, after: string, path: string): string {
  if (before === after) return '';

  const beforeLines = before === '' ? [] : before.split(/\r?\n/);
  const afterLines = after === '' ? [] : after.split(/\r?\n/);

  // Drop trailing empty line from split if input ended with newline.
  if (before.endsWith('\n') && beforeLines[beforeLines.length - 1] === '') beforeLines.pop();
  if (after.endsWith('\n') && afterLines[afterLines.length - 1] === '') afterLines.pop();

  const ops = diffLines(beforeLines, afterLines);

  const beforeHeader = before === '' ? '/dev/null' : path;
  const afterHeader = after === '' ? '/dev/null' : path;

  let output = `--- ${beforeHeader}\n+++ ${afterHeader}\n`;
  // Single hunk covering the whole file - SCS items are small, so no need
  // to split into multiple hunks for context economy.
  output += `@@ -1,${beforeLines.length} +1,${afterLines.length} @@\n`;
  for (const op of ops) {
    if (op.kind === 'equal') output += ` ${op.line}\n`;
    else if (op.kind === 'remove') output += `-${op.line}\n`;
    else output += `+${op.line}\n`;
  }
  return output;
}

interface DiffOp {
  kind: 'equal' | 'remove' | 'add';
  line: string;
}

function diffLines(a: string[], b: string[]): DiffOp[] {
  // LCS table.
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack.
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { ops.unshift({ kind: 'equal', line: a[i - 1] }); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { ops.unshift({ kind: 'remove', line: a[i - 1] }); i--; }
    else { ops.unshift({ kind: 'add', line: b[j - 1] }); j--; }
  }
  while (i > 0) { ops.unshift({ kind: 'remove', line: a[i - 1] }); i--; }
  while (j > 0) { ops.unshift({ kind: 'add', line: b[j - 1] }); j--; }
  return ops;
}
