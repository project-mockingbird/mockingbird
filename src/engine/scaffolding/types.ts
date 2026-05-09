/**
 * Scaffolding types - shared by orchestrators, action dispatcher, and
 * definition-items discovery. The shapes mirror Sitecore's SPE script
 * model: actions are data-driven (template-keyed) and definitions are
 * discoverable from registry, user tree, or a curated baseline.
 *
 * See docs/superpowers/specs/2026-05-08-sxa-headless-scaffolding-design.md
 * for the source-grounded design rationale.
 */

export type FieldUpdate = {
  fieldId: string;
  value: string;
};

export type ScaffoldingAction =
  | {
      kind: 'EditTenantTemplate';
      editType:
        | 'AddBaseTemplate'
        | 'AddInsertOptions'
        | 'AddTenantTemplatesToInsertOptions';
      targetTemplateId: string;
      argumentIds: string[];
    }
  | {
      kind: 'AddItem';
      locationTemplateId: string;
      templateId: string;
      name: string;
      fieldUpdates: FieldUpdate[];
    }
  | {
      kind: 'ExecuteScript';
      scriptId: string;
    };

export type DefinitionItem = {
  id: string;
  path: string;
  name: string;
  displayName?: string;
  description?: string;
  isSystemModule: boolean;
  includeByDefault: boolean;
  includeIfInstalled: string[];
  hasChildren: boolean;
  source: 'registry' | 'tree' | 'curated';
  actions: ScaffoldingAction[];
};

export type ScaffoldHeadlessTenantInput = {
  tenantLocation: string;
  tenantName: string;
  displayName?: string;
  description?: string;
  language?: string;
  definitionItemIds: string[];
};

export type ScaffoldHeadlessSiteInput = {
  siteLocation: string;
  siteName: string;
  hostName: string;
  virtualFolder: string;
  displayName?: string;
  description?: string;
  language?: string;
  languages?: string[];
  pos?: string;
  graphQLEndpoint?: string;
  deploymentSecret?: string;
  definitionItemIds: string[];
};

export type ScaffoldResult = {
  rootItemPath: string;
  rootItemId: string;
  createdCount: number;
  createdPaths: string[];
  warnings: string[];
};

export type ScaffoldErrorCode =
  | 'parent-not-found'
  | 'parent-template-mismatch'
  | 'name-collision'
  | 'definition-item-not-found'
  | 'branch-prototype-not-found'
  | 'invalid-action'
  | 'unsupported-action';

export class ScaffoldError extends Error {
  constructor(
    public readonly code: ScaffoldErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScaffoldError';
  }
}
