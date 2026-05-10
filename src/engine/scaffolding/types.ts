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
      /**
       * The action item's `Template` field value. Mirrors what the SPE
       * cmdlets do: load this prototype item, take its template field as
       * the LOOKUP KEY, then find the tenant-local template whose
       * `__Base template` chain inherits from that key. The prototype
       * itself is not the target - its template-type is the discriminator.
       */
      prototypeId: string;
      argumentIds: string[];
    }
  | {
      kind: 'AddItem';
      /**
       * The action item's `Location` field value: a prototype item id under
       * /sitecore/masters/... that names where the new item should be added.
       * Same prototype-template-resolution pattern as EditTenantTemplate -
       * resolve to prototype.template.id at dispatch time, then BFS the site
       * subtree for a descendant whose template inherits from that key.
       */
      locationPrototypeId: string;
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
