/**
 * Scaffolding types - shared by orchestrators, action dispatcher, and
 * definition-items discovery. Definitions are discovered from the
 * OOTB registry by setup-template GUID (HeadlessTenantSetup /
 * HeadlessSiteSetup), and overlaid with any user-authored ones in the
 * serialized tree. Actions are data-driven (template-keyed).
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
  source: 'registry' | 'tree';
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
