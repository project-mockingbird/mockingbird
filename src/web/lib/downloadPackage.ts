// src/web/lib/downloadPackage.ts
//
// Browser-side helper for POST /api/package: posts the cart + metadata,
// pulls the response as a Blob, and triggers a hidden-anchor download.
// Returns the parsed filename / warnings / item count from the response so
// the caller can show a success toast like
// `Downloaded site.zip (847 items, 2 warnings)`.
//
// Paired with the server route at src/api/routes/package.ts. The response
// header contract is:
//   - Content-Disposition: attachment; filename="<name>.zip"
//   - X-Mockingbird-Package-Warnings: JSON-encoded PackageWarning[]
//   - X-Mockingbird-Package-Item-Count: integer

import type { CartSource } from '../state/packageCartStore';

export interface DownloadPackageArgs {
  sources: CartSource[];
  metadata: {
    name: string;
    author?: string;
    version?: string;
    comment?: string;
    publisher?: string;
    license?: string;
  };
}

export type PackageWarning =
  | { kind: 'unresolved-root'; sourceId: string; rootPath: string }
  | { kind: 'parse-failure'; itemId: string; itemPath: string; reason: string }
  | { kind: 'truncated'; droppedCount: number };

export interface DownloadResult {
  filename: string;
  warnings: PackageWarning[];
  itemCount: number;
}

export async function downloadPackage(args: DownloadPackageArgs): Promise<DownloadResult> {
  const res = await fetch('/api/package', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    // Try to surface the server's `{ error }` field; fall back to statusText
    // when the response has no parseable body (e.g. raw 500 from a proxy).
    const fallback = res.statusText || `Build failed (${res.status})`;
    const err = await res
      .json()
      .catch(() => ({ error: fallback }));
    throw new Error((err && err.error) ? err.error : fallback);
  }

  const cd = res.headers.get('Content-Disposition') ?? '';
  const filename = cd.match(/filename="([^"]+)"/)?.[1] ?? `${args.metadata.name}.zip`;

  // Warnings header is JSON-encoded server-side; parse defensively.
  let warnings: PackageWarning[] = [];
  const warningsHeader = res.headers.get('X-Mockingbird-Package-Warnings');
  if (warningsHeader) {
    try {
      const parsed = JSON.parse(warningsHeader);
      if (Array.isArray(parsed)) warnings = parsed as PackageWarning[];
    } catch {
      // Header malformed - ignore rather than failing the download.
    }
  }

  const countHeader = res.headers.get('X-Mockingbird-Package-Item-Count');
  const itemCount = countHeader ? Number.parseInt(countHeader, 10) || 0 : 0;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }

  return { filename, warnings, itemCount };
}
