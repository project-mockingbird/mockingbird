/**
 * Curated v1 Definition Items, baked into Mockingbird so the dialog
 * feature checklists are functional on a fresh install. Definitions
 * authored by the user in their content tree are unioned with these
 * at discovery time.
 *
 * v1 ships the bare minimum that produces a working JSS site:
 *   - Empty Headless Tenant: registers JSSPage as a base template
 *     (so the JSS app's Page template inherits SXA basics) and
 *     does not add additional content beyond the tenant branch
 *     defaults.
 *   - Empty Headless Site: relies entirely on the JSS Site branch
 *     template's defaults (Settings child, Site Definition descendant,
 *     Home page). No extra AddItem actions needed in v1.
 *
 * Future cycles can grow this catalogue (additional features like SXA
 * Forms scaffolding, Page Designs starter, etc.) without touching the
 * registry build pipeline.
 */
import type { DefinitionItem } from './types.js';

const JSSPAGE_TEMPLATE_ID = '47151711-26ca-434e-8132-d3e0b7d26683';

export const CURATED_TENANT_DEFINITIONS: DefinitionItem[] = [
  {
    id: 'curated-empty-headless-tenant',
    path: '<curated>/Empty Headless Tenant',
    name: 'Empty Headless Tenant',
    displayName: 'Empty Headless Tenant',
    description:
      'Minimal tenant scaffold. Inherits the JSSPage base template into the tenant`s Page template and otherwise produces only the structure created by the tenant branch.',
    isSystemModule: false,
    includeByDefault: true,
    includeIfInstalled: [],
    hasChildren: true,
    source: 'curated',
    actions: [
      {
        kind: 'EditTenantTemplate',
        editType: 'AddBaseTemplate',
        // The orchestrator resolves "<page>" to the tenant`s Page
        // template (the one renamed from "Base Page" -> "Page" in
        // Add-JSSTenant) at action-dispatch time. Curated definitions
        // use this sentinel since the tenant`s template IDs are
        // generated per scaffold-run.
        targetTemplateId: '<tenant-page-template>',
        argumentIds: [JSSPAGE_TEMPLATE_ID],
      },
    ],
  },
];

export const CURATED_SITE_DEFINITIONS: DefinitionItem[] = [
  {
    id: 'curated-empty-headless-site',
    path: '<curated>/Empty Headless Site',
    name: 'Empty Headless Site',
    displayName: 'Empty Headless Site',
    description:
      'Minimal site scaffold. Relies on the JSS Site branch template defaults: Settings child, Site Definition descendant, Home page. No extra AddItem or EditSiteItem actions in v1.',
    isSystemModule: false,
    includeByDefault: true,
    includeIfInstalled: [],
    hasChildren: true,
    source: 'curated',
    actions: [],
  },
];
