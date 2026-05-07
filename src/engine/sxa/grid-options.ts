import type { Engine } from '../index.js';
import {
  lookupUnifiedItemByPath, getMergedChildren, getId, getName, type UnifiedItem,
} from '../layout/unified-item.js';
import { formatGuidBraced } from '../guid.js';
import { readSharedField } from '../layout/item-fields.js';
import { sortOrderOf } from './_sort.js';

const CLASS_FIELD_ID = '591c584f-08a7-4dc6-9d58-1de178c404a2';

/**
 * Well-known global Settings paths where SXA stores Grid Definitions. The
 * Grid Definition is NOT per-site - it lives globally under
 * `/sitecore/system/Settings/Feature/Experience Accelerator/<Variant>/<Variant> Grid Definition`.
 *
 * We try Bootstrap 5 first (current default), then fall back through older
 * variants in descending preference order. First hit wins.
 */
const KNOWN_GRID_PATHS: ReadonlyArray<string> = [
  '/sitecore/system/Settings/Feature/Experience Accelerator/Bootstrap 5/Bootstrap 5 Grid Definition',
  '/sitecore/system/Settings/Feature/Experience Accelerator/Bootstrap 4/Bootstrap 4 Grid Definition',
  '/sitecore/system/Settings/Feature/Experience Accelerator/Bootstrap 3/Bootstrap 3 Grid Definition',
  '/sitecore/system/Settings/Feature/Experience Accelerator/Grid960/Grid960 Grid Definition',
  '/sitecore/system/Settings/Feature/Experience Accelerator/GridTailwind/GridTailwind Grid Definition',
];

const BREAKPOINT_ABBR_MAP: Record<string, string> = {
  'extra small': '',
  'small': 'sm',
  'medium': 'md',
  'large': 'lg',
  'extra large': 'xl',
  'extra extra large': 'xxl',
};

const BREAKPOINT_SORT_ORDER: Record<string, number> = {
  'extra small': 0, 'small': 1, 'medium': 2, 'large': 3, 'extra large': 4, 'extra extra large': 5,
};

const KIND_PREFIX: Record<string, string> = {
  'size': 'col',
  'offset': 'offset',
  'order': 'order',
  'display': 'd',
  'component alignment': 'align',
};

function abbreviationFor(breakpointName: string): string {
  return BREAKPOINT_ABBR_MAP[breakpointName.toLowerCase()] ?? slugify(breakpointName);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Compose a Bootstrap CSS class from path segments. Standard SXA convention:
 *   <prefix>[-<abbr>]-<value>
 * where prefix is from KIND_PREFIX and abbr is from BREAKPOINT_ABBR_MAP
 * (empty for "extra small" - the smallest breakpoint omits its abbreviation).
 */
export function composeBootstrapClass(breakpoint: string, kind: string, value: string): string {
  const prefix = KIND_PREFIX[kind.toLowerCase()] ?? slugify(kind);
  const abbr = abbreviationFor(breakpoint);
  return abbr ? `${prefix}-${abbr}-${value}` : `${prefix}-${value}`;
}

export interface GridBreakpoint {
  key: string;
  displayName: string;
  sortOrder: number;
  abbr: string;
}

export interface GridDimension {
  key: string;
  displayName: string;
  tab: 'basic' | 'advanced';
}

export interface GridOptionItem {
  id: string;
  displayName: string;
  cssClass: string;
}

export interface GridCell {
  breakpointKey: string;
  dimensionKey: string;
  options: GridOptionItem[];
}

export interface GridOptionsResult {
  breakpoints: GridBreakpoint[];
  dimensions: GridDimension[];
  cells: GridCell[];
}

/**
 * Locate the Grid Definition root by trying the well-known global paths in
 * preference order. SXA stores Grid Definitions globally under
 * `/sitecore/system/Settings/Feature/Experience Accelerator`, NOT per-site
 * under `<siteRoot>/Presentation/Styles` - the latter only carries Site Grid
 * setup links pointing at the global definition.
 */
function findGridDefinitionRoot(engine: Engine): UnifiedItem | undefined {
  for (const path of KNOWN_GRID_PATHS) {
    const root = lookupUnifiedItemByPath(engine, path);
    if (root) return root;
  }
  return undefined;
}

/**
 * The `_siteRootPath` parameter is retained for backward compatibility with
 * the API route but ignored: Grid Definitions are global, not per-site. See
 * {@link findGridDefinitionRoot}.
 */
export function resolveGridOptions(engine: Engine, _siteRootPath: string): GridOptionsResult {
  const root = findGridDefinitionRoot(engine);
  if (!root) return { breakpoints: [], dimensions: [], cells: [] };

  const breakpointsByKey = new Map<string, GridBreakpoint>();
  const dimensionsByKey = new Map<string, GridDimension>();
  const cellsMap = new Map<string, GridOptionItem[]>();

  // Sort children by `__Sortorder` (Sitecore default 100 for missing values),
  // then by name. Optional `sortKey` provides a numeric tiebreaker for
  // value-name items where authors omit `__Sortorder` but rely on numeric
  // names (1..12) sorting numerically rather than lex (1, 10, 11, 2, ...).
  const sortChildren = (parent: UnifiedItem, sortKey?: (n: string) => number): UnifiedItem[] => {
    const children = [...getMergedChildren(parent, engine)];
    return children.sort((a, b) => {
      const sa = sortOrderOf(engine, getId(a));
      const sb = sortOrderOf(engine, getId(b));
      if (sa !== sb) return sa - sb;
      const na = getName(a);
      const nb = getName(b);
      if (sortKey) {
        const ka = sortKey(na);
        const kb = sortKey(nb);
        if (ka !== kb && Number.isFinite(ka) && Number.isFinite(kb)) return ka - kb;
      }
      return na.localeCompare(nb);
    });
  };

  for (const bpItem of sortChildren(root)) {
    const bpName = getName(bpItem);
    const bpKey = slugify(bpName);
    if (!breakpointsByKey.has(bpKey)) {
      breakpointsByKey.set(bpKey, {
        key: bpKey,
        displayName: bpName,
        // Canonical Bootstrap order for known names takes precedence; otherwise
        // fall back to authored `__Sortorder` so non-canonical breakpoints
        // (custom tenant additions) still get a stable, author-controlled order.
        sortOrder: BREAKPOINT_SORT_ORDER[bpName.toLowerCase()] ?? sortOrderOf(engine, getId(bpItem)),
        abbr: abbreviationFor(bpName),
      });
    }

    for (const dimItem of sortChildren(bpItem)) {
      const dimName = getName(dimItem);
      const dimKey = slugify(dimName);
      if (!dimensionsByKey.has(dimKey)) {
        dimensionsByKey.set(dimKey, {
          key: dimKey,
          displayName: dimName,
          tab: dimName.toLowerCase() === 'size' ? 'basic' : 'advanced',
        });
      }
      const cellKey = `${bpKey}|${dimKey}`;
      if (!cellsMap.has(cellKey)) cellsMap.set(cellKey, []);
      const cellOptions = cellsMap.get(cellKey)!;
      // Numeric tiebreaker on value names: a Size column with values
      // 1, 2, ..., 12 sorts numerically rather than lex (1, 10, 11, 2).
      for (const valueItem of sortChildren(dimItem, n => Number(n))) {
        const valueName = getName(valueItem);
        // Prefer the authored `Class` field on the value item - that's the
        // canonical CSS class string Sitecore renders. Fall back to deriving
        // it from breakpoint/dimension/value names when the field is absent
        // or empty (e.g. test fixtures, custom dimensions).
        const classFromField = readSharedField(engine, getId(valueItem), CLASS_FIELD_ID);
        const cssClass = (classFromField && classFromField.trim() !== '')
          ? classFromField
          : composeBootstrapClass(bpName, dimName, valueName);
        cellOptions.push({
          id: formatGuidBraced(getId(valueItem)),
          displayName: valueName,
          cssClass,
        });
      }
    }
  }

  const sortedBreakpoints = Array.from(breakpointsByKey.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    breakpoints: sortedBreakpoints,
    dimensions: Array.from(dimensionsByKey.values()),
    // Deterministic cell order: by breakpoint sortOrder, then by the
    // dimension's first-seen insertion order (which already respects
    // sorted-tree traversal above). Avoids consumer-visible reordering
    // run-to-run when cellsMap entry insertion happened to differ.
    cells: (() => {
      const sortedBpOrder = new Map(sortedBreakpoints.map(b => [b.key, b.sortOrder]));
      const sortedDimOrder = new Map(Array.from(dimensionsByKey.keys()).map((k, i) => [k, i]));
      return Array.from(cellsMap.entries())
        .map(([key, options]) => {
          const [breakpointKey, dimensionKey] = key.split('|');
          return { breakpointKey, dimensionKey, options };
        })
        .sort((a, b) => {
          const bpDiff = (sortedBpOrder.get(a.breakpointKey) ?? 999) - (sortedBpOrder.get(b.breakpointKey) ?? 999);
          if (bpDiff !== 0) return bpDiff;
          return (sortedDimOrder.get(a.dimensionKey) ?? 999) - (sortedDimOrder.get(b.dimensionKey) ?? 999);
        });
    })(),
  };
}
