// Well-known template GUIDs (lowercase, no braces)
export const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
export const TEMPLATE_SECTION_TEMPLATE_ID = 'e269fbb5-3750-427a-9149-7aa950b49301';
export const TEMPLATE_FIELD_TEMPLATE_ID = '455a3e98-a627-4b40-8035-e683a0331ac7';
export const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
// Sitecore's abstract `Rendering` template — every user-authored rendering
// item in this editor gets this template. Distinct from the SXA/JSS
// `Json Rendering` template (`04646a89-...`) which real SXA renderings
// actually inherit from — see `JSON_RENDERING_TEMPLATE_ID` in component-resolver.
export const RENDERING_TEMPLATE_ID = '99f8905d-e352-41e0-aff4-8d3a5f66f3f0';

// SXA Redirects — each `Redirect Map` item holds many pattern=target pairs
// in its `UrlMapping` field, plus flags applied to all entries in the map.
// `Redirect Map Grouping` is a folder template used to nest Redirect Maps
// under the `Redirects` container; walk through but do not emit.
export const REDIRECT_MAP_TEMPLATE_ID = 'f4fb6125-f113-4373-8aa2-4648c2c1960e';
export const REDIRECT_MAP_GROUPING_TEMPLATE_ID = 'e1cf805e-7f49-4ec9-a25a-182dc798cb5f';
export const REDIRECT_FIELD_IDS = {
  urlMapping: '5ecfffc9-d530-4512-b757-9e9830f07d5a',
  redirectType: '980dfa07-41d4-4c4e-ab28-de657afdb6bc',
  preserveQueryString: 'f24d347e-98c2-4995-a14c-b15697ba86e5',
  preserveLanguage: 'd3319168-3cff-431e-b3fb-d6a9c0d574a3',
} as const;

// Sitecore media item shared fields. Blob is a base64-encoded binary payload;
// Mime Type / Extension drive the HTTP Content-Type when the media item is
// served via the `/-/media/*` passthrough. The Blob field ID has the third
// GUID group as `4702`, not `0702` — verified against every real reference
// content tree media yml in the content mount.
export const BLOB_FIELD_ID = '40e50ed9-ba07-4702-992e-a912738d32dc';
export const MIME_TYPE_FIELD_ID = '6f47a0a5-9c94-4b48-abeb-42d38def6054';
export const EXTENSION_FIELD_ID = 'c06867fe-9a43-4c7d-b739-48780492d06f';
export const MEDIA_LIBRARY_PATH_PREFIX = '/sitecore/media library';

// SXA Standard Values Overlay — per-site Site Collection Templates.
// Subject-template opt-in marker: only templates that inherit from this
// participate in SCT resolution (mirrors SXA's `GetStandardValue.TestInheritance`).
export const PER_SITE_STANDARD_VALUES_TEMPLATE_ID = '44a022db-56d3-419a-b43b-e27e4d8e9c41';
// Folder marker templates — SCT folder is located by `FirstChildInheritingFrom`
// of these under each site's Settings item.
export const BASE_SXA_STANDARD_VALUES_FOLDER_TEMPLATE_ID = 'f2141646-b989-4f4d-936d-f25acaa28c8d';
export const BASE_SETTINGS_TEMPLATE_ID = '6d8ff35b-49fa-4896-b370-eb35d6b99f3f';
// Site/tenant marker templates used for upward-walking ancestor resolution.
export const BASE_SITE_ROOT_TEMPLATE_ID = 'a2b9fdc3-f641-4966-94a5-b63944dc39de';
export const BASE_TENANT_TEMPLATE_ID = '78180355-f0a2-4161-a34c-3069a9e17539';
// SXA `_Base Data Folder` - the abstract base template a Page Data folder
// is supposed to inherit from. Found in the decompile at
// `XA.Foundation.Multisite\Templates.cs:292`. In practice, some corpora
// have SXA's concrete "Page Data" template inherit ONLY from Standard
// template (the _Base Data Folder ancestor link is missing), so the
// predicate must accept the concrete template ID directly too.
export const BASE_DATA_FOLDER_TEMPLATE_ID = '66fb7845-4523-42db-9b31-b79c64d72534';
// SXA `Page Data` - the concrete template SXA installs and pages use as
// their per-page data folder. Lives at `/sitecore/templates/Foundation/
// Experience Accelerator/Local Datasources/Page Data`. Hardcoded as a
// second anchor for the Page Data folder predicate (see above).
export const PAGE_DATA_TEMPLATE_ID = '1c82e550-ebcd-4e5d-8abd-d50d0809541e';
// `_BaseTenant.Fields.SharedSites` — multilist of sibling site items whose
// SCT folders serve as fallback when current site has no match.
export const SHARED_SITES_FIELD_ID = '7d29b525-8118-45c6-a89b-773a6a576ec7';

// `SiteMediaLibrary` field on the SXA Site template (per
// `Sitecore.XA.Foundation.Multisite.Templates.Site.Fields.SiteMediaLibrary`).
// Single-value droptree pointing at the media-library item that holds the
// site's media content. Used to resolve the bare `query:$siteMedia` lookup-
// source form for Headless sites - the SXA-classic walk
// (FirstChildInheritingFrom Media template) does not apply because Headless
// sites declare the media library root explicitly via this field.
export const SITE_MEDIA_LIBRARY_FIELD_ID = '33d9005e-1f71-415f-b107-53b965c3b037';

// SXA Site Grouping discovery - the base template every Site Grouping item
// inherits from. Sitecore's `SxaSiteProvider.GetSites()` queries via
// `database.GetContentItemsOfTemplate(_BaseSiteDefinition.ID)` so the
// equivalent mockingbird-side scan walks every item whose template chain
// includes this id. (`Sitecore.XA.Foundation.Multisite.Templates._BaseSiteDefinition.ID`)
export const BASE_SITE_DEFINITION_TEMPLATE_ID = '2bb25752-b3bc-4f13-b9cb-38b906d21a33';

// SXA Site Grouping field IDs read by `parseSiteItem` to build a SiteInfo.
// All shared fields on the OOTB SXA Site Grouping template; values are
// authored on the concrete site item or inherited via __Standard Values.
// `targetHostName` and `virtualFolder` are not read by the current resolver
// (the SDK CLI's `siteInfoCollection` query selects only name/hostname/
// language/rootPath/startItem); kept here for completeness so future
// resolver extensions don't have to chase down the GUIDs.
export const SITE_FIELD_IDS = {
  siteName: 'cb4e9e2e-2b66-43dc-ad3f-9caf363d28d3',
  hostName: '8e0dd914-9afb-4d45-bf8b-7ff5d6e5337e',
  targetHostName: 'e5b5ccb5-17a1-429d-bd3e-6122b3216e52',
  startItem: '1ee576af-ba8e-4312-9fbd-2ccf8395baa1',
  language: 'f19277fe-1b85-4b0a-8c26-5e74d766b3a3',
  environment: 'da06d09e-02b6-464a-80fc-9d8d7fc875e3',
  virtualFolder: '475031d8-724d-463c-80b2-90839dd1ad98',
  // `_BaseSiteDefinition.SxaLinkable` checkbox. Drives the SXA cross-site
  // linking gate (`SiteExtensions.IsSxaLinkable`) and downstream
  // `query:$linkableHomes` resolution. Decompile:
  // `XA.Foundation.Multisite/Templates.cs:34` (struct
  // `_BaseSiteDefinition.Fields.SxaLinkable`).
  sxaLinkable: '4eeff055-edcd-4387-9e86-c3f40a15dbac',
} as const;

// `_LinkSettings.LinkSettings` enum field on the per-site Settings item.
// Read by `CrossSiteLinkingService.GetSiteLinkSettings` to choose between
// `ItselfOnly` / `LinkableSitesInTenant` / `AllLinkableSites`. Decompile:
// `XA.Foundation.Multisite/Templates.cs:254`.
export const LINK_SETTINGS_FIELD_ID = 'e41d2d4b-4c5d-4467-a8d6-0cfa23577501';

// LayoutService rendering-entry emission contract (0.4.0.14).
// Read at emission time to port Sitecore's `PlaceholderTransformer` + `RenderingContentsResolver` contracts.

/** Field ID of `__Final Renderings` - the versioned SXA layout field used across pages, partials, and page designs. */
export const FINAL_RENDERINGS_FIELD_ID = '04bf00db-f5fb-41f7-8ab7-22408372a981';

// Rendering item (shared): Multilist of Placeholder Settings references —
// declares which placeholder slots Sitecore emits for this rendering,
// even when empty. `Sitecore.LayoutService.decompiled.cs:4398` reads
// `item.Fields["Placeholders"]`.
//
// 0.4.0.16: corrected from `6f11fb65-...` (View Rendering template's
// Placeholders) to the actual Rendering Options.Layout Service.Placeholders
// field at `/sitecore/templates/System/Layout/Sections/Rendering Options/Layout Service/Placeholders`.
// The Json Rendering template (SXA/headless) inherits this one; the old ID
// was never present on any SXA rendering item, which is why 0.4.0.14's P2
// empty-slot emission silently returned `[]` from `getDeclaredPlaceholderKeys`
// across the entire content tree.
export const PLACEHOLDERS_FIELD_ID = '069a8361-b1cd-437c-8c32-a3be78941446';

// Placeholder Settings item (shared, Single-Line Text): the emitted slot name
// when a rendering declares this placeholder. `Sitecore.LayoutService.decompiled.cs:2603-2613`
// reads `InnerItem["Placeholder Key"]`.
export const PLACEHOLDER_KEY_FIELD_ID = '7256bdab-1fd2-49dd-b205-cb4873d2917c';

// Rendering item (shared, Reference): points at the Rendering Contents Resolver
// settings item. When unset, Sitecore uses the default configured at
// `layoutService/renderingContentsResolvers` (`UseContextItem=false`,
// `ItemSelectorQuery` unset → `fields` key absent when datasource is empty).
// `Sitecore.LayoutService.decompiled.cs:2262-2296`.
//
// 0.4.0.16: corrected from `56ca26f1-...` (a different template's RCR field)
// to the actual Rendering Options.Layout Service.Rendering Contents Resolver
// field at `/sitecore/templates/System/Layout/Sections/Rendering Options/Layout Service/Rendering Contents Resolver`.
// Same cause as PLACEHOLDERS_FIELD_ID — the old ID never resolved on SXA
// rendering items, so 0.4.0.14's P1 RCR-gate and 0.4.0.15's Fix 2 were
// effectively inert on real data.
export const RENDERING_CONTENTS_RESOLVER_FIELD_ID = 'b0b15510-b138-470e-8f33-8da2e228aafe';

// Rendering item (shared, Single-Line Text): overrides the emitted
// `componentName`. `Sitecore.LayoutService.decompiled.cs:2329-2341`
// `Initialize.GetComponentName`:
//   string text = renderingItem[FieldIDs.JsonRendering.ComponentName];
//   if (string.IsNullOrWhiteSpace(text)) text = renderingItem.Name;
// This is the field on the SXA Json Rendering template's `Data` section —
// item at `/sitecore/templates/Foundation/JavaScript Services/Json Rendering/Data/componentName`.
// 0.4.0.16: added so renderings whose item name ≠ intended componentName
// (e.g. renamed-in-Sitecore / aliased) emit Sitecore's value.
export const COMPONENT_NAME_FIELD_ID = '037fe404-dd19-4bf7-8e30-4dadf68b27b0';

// Action ID for `Sitecore.Rules.ConditionalRenderings.HideRenderingAction`.
// Used in the default-rule `<actions>` block inside `<rls>` to mark a rendering
// hidden by default — prod emits `{uid, componentName:null, dataSource:null, experiences:{}}`.
// `Sitecore.Kernel.decompiled.cs:106832-106850`.
export const HIDE_RENDERING_ACTION_ID = '25f351a1-712d-45f8-857d-8ad95bb2ace9';

/** Set of well-known built-in template IDs that do not need to resolve in the tree. */
export const KNOWN_BUILTIN_TEMPLATE_IDS = new Set([STANDARD_TEMPLATE_ID]);

// Well-known field definition GUIDs (used in SharedFields on various item types)
export const FIELD_IDS = {
  // Template Field properties
  type: 'ab162cc0-dc80-4abf-8871-998ee5d7ba32',
  source: '1eb8ae32-e190-44a6-968d-ed904c794ebf',
  shared: 'be351a73-fcb0-4213-93fa-c302d8ab4f51',
  unversioned: '39847666-389d-409b-95bd-f2016f11eed5',
  title: '19a69332-a23e-4e70-8d16-b2640cb24cc8',
  defaultValue: 'b118496a-0f78-4a27-b55f-0a6c4b0b0fe1',

  // Common fields
  baseTemplate: '12c33f3f-86c5-43a5-aeb4-5598cec45116',
  standardValues: 'f7d48a55-2158-4f02-9356-756654404f73',
  icon: '06d5295c-ed2f-4a54-9bf2-26228d113318',
  displayName: 'b5e02ad9-d56f-4c41-a065-a133db87bdeb',
  sortorder: 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e',
  created: '25bed78c-4957-4165-998a-ca1b52f67497',
  updated: 'd9cf14b1-fa16-4ba6-9288-e8a174d4d522',
  subitemsSorting: '6fd695e7-7f6d-4ca5-8b49-a829e5950ae9',
  updatedBy: 'badd9cf9-53e0-4d0c-bcc0-2d784c282f6a',
  revision: '8cdc337e-a112-42fb-bbb4-4143751e123f',

  // Placeholder Settings fields
  allowedControls: 'e391b526-d0c5-439d-803e-17512eae6222',

  // Rendering item: Multilist of Placeholder Settings GUIDs.
  placeholders: PLACEHOLDERS_FIELD_ID,

  // Placeholder Settings item: the key string for the slot.
  placeholderKey: PLACEHOLDER_KEY_FIELD_ID,

  // Rendering item (shared, Reference): points at the template that defines
  // the rendering's parameter fields. The stored value is a brace-wrapped
  // GUID string. When absent, the rendering has no parameter schema.
  // `Sitecore.Kernel.decompiled.cs:380993` reads `renderingItem["Parameters Template"]`.
  parametersTemplate: 'a77e8568-1ab3-44f1-a664-b7c37ec7810d',

  // Insert Options - shared field on Standard template. Tree-list of
  // template / branch-template GUIDs that appear in the right-click Insert
  // submenu. Configured on `__Standard Values` for the common case; can
  // appear directly on items as an override (rare, defensive read).
  // Sitecore.Kernel decompile: standard field on `Standard template`.
  masters: '1172f251-dad4-4efb-a329-0c63500e4f1e',
} as const;

/** `Template Folder` template (Sitecore's canonical container for templates
 *  under /sitecore/templates). Distinct from the generic Common/Folder. */
export const TEMPLATE_FOLDER_TEMPLATE_ID = '0437fee2-44c9-46a6-abe9-28858d9fee8c';

// `Sitecore.Data.TemplateIDs.BranchTemplate` - the template id used by every
// branch template item. Sitecore detects branches by THIS id, not by path
// (`Sitecore.Data.Items.BranchItem` checks template id, not location). Real
// Sitecore corpora have branches at both `/sitecore/templates/Branches/*`
// AND SXA Page Branches under `/sitecore/content/.../Presentation/Page
// Branches/*` - both share this template id, so path-prefix detection
// silently misses the SXA case and stamps the branch's own id as the new
// item's template.
export const BRANCH_TEMPLATE_ID = '35e75c72-4985-4e09-88c3-0eac6cd1e64f';

// Valid SitecoreAI field types
export const VALID_FIELD_TYPES = [
  'Checkbox',
  'Date',
  'Datetime',
  'Droplink',
  'Droplist',
  'Droptree',
  'File',
  'General Link',
  'General Link with Search',
  'Image',
  'Integer',
  'Internal Link',
  'Multi-Line Text',
  'Multilist',
  'Multiline Text',
  'Multi-Root Treelist',
  'Name Lookup Value List',
  'Name Value List',
  'Number',
  'Password',
  'Rich Text',
  'Single-Line Text',
  'Tag Treelist',
  'Treelist',
  'Treelist with Search',
  'TreelistEx',
] as const;

export type SitecoreFieldType = typeof VALID_FIELD_TYPES[number];

// Extract every brace-wrapped GUID from a Sitecore-style multilist field value (`__Base template`, `Page Design.PartialDesigns`, etc.). Handles both single-line pipe-separated (`{guid1}|{guid2}`) and block-scalar multi-line (`{guid1}\n{guid2}`) shapes; returns lowercase brace-free GUIDs.
export function parseBraceGuids(value: string | undefined): string[] {
  if (!value) return [];
  const matches = value.match(/\{[^}\s]+\}/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).toLowerCase());
}

// Classify an item by its template GUID
export function classifyItem(templateId: string): import('./types.js').ItemType {
  switch (templateId.toLowerCase()) {
    case TEMPLATE_TEMPLATE_ID: return 'template';
    case TEMPLATE_SECTION_TEMPLATE_ID: return 'templateSection';
    case TEMPLATE_FIELD_TEMPLATE_ID: return 'templateField';
    case RENDERING_TEMPLATE_ID: return 'rendering';
    default: return 'unknown';
  }
}
