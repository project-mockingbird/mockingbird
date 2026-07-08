/**
 * GraphQL Edge schema introspection parity gate.
 *
 * Asserts that Mockingbird's built schema is a SUPERSET of the Sitecore XM Cloud
 * Edge schema (EdgeSchema 1.6.800, decompiled). Mockingbird MAY expose additional
 * fields beyond the Edge contract; it MUST NOT be missing any required type,
 * field, argument, enum value, or input field.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../src/engine/constants.js';
import { registerGraphQLRoutes } from '../../src/api/routes/graphql.js';

// ---------------------------------------------------------------------------
// Fixture: minimal engine with one template so generated types are emitted
// ---------------------------------------------------------------------------

const SITE_ROOT = '/sitecore/content/site/Home';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

// A concrete template so the schema generator emits at least one generated type.
const sampleTemplateId = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sampleSectionId = 'aaaa0002-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sampleFieldId = 'aaaa0003-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const FIXTURES: ScsItem[] = [
  makeItem({
    id: sampleTemplateId,
    path: '/sitecore/templates/Project/site/Sample Page',
    template: TEMPLATE_TEMPLATE_ID,
  }),
  makeItem({
    id: sampleSectionId,
    parent: sampleTemplateId,
    path: '/sitecore/templates/Project/site/Sample Page/Content',
    template: TEMPLATE_SECTION_TEMPLATE_ID,
  }),
  makeItem({
    id: sampleFieldId,
    parent: sampleSectionId,
    path: '/sitecore/templates/Project/site/Sample Page/Content/Sample Title',
    template: TEMPLATE_FIELD_TEMPLATE_ID,
    sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
  }),
  makeItem({
    id: 'aaaa0004-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    path: SITE_ROOT,
    template: sampleTemplateId,
    languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
  }),
];

async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const engine = buildEngine(FIXTURES);
  const { registerSiteContextHook } = await import('../../src/api/hooks/site-context.js');
  registerSiteContextHook(app, engine, SITE_ROOT);
  await registerGraphQLRoutes(app, engine, { mediaBaseUrl: '' });
  return app;
}

// ---------------------------------------------------------------------------
// Expected surface - derived from the decompiled Edge SDL (EdgeSchema 1.6.800)
// Format: type name -> { kind, fields, fieldArgs, enumValues, inputFields }
// Superset semantics: Mockingbird MAY expose extras; MUST NOT miss any entry.
// ---------------------------------------------------------------------------

type TypeExpectation = {
  kind: string;
  /** Field names that MUST be present on this type. */
  fields?: string[];
  /**
   * For each field listed here, the argument names that MUST be present.
   * Only checked for fields where the SDL specifies arguments.
   */
  fieldArgs?: Record<string, string[]>;
  /** Enum value names that MUST be present (ENUM types only). */
  enumValues?: string[];
  /** Input field names that MUST be present (INPUT_OBJECT types only). */
  inputFields?: string[];
};

const EXPECTED: Record<string, TypeExpectation> = {
  // --- Scalars ---
  JSON: { kind: 'SCALAR' },
  Long: { kind: 'SCALAR' },

  // --- Enums ---
  OrderByDirection: {
    kind: 'ENUM',
    enumValues: ['ASC', 'DESC'],
  },
  SearchOperator: {
    // EdgeSchema type name: ItemSearchOperator - re-exposed as SearchOperator
    kind: 'ENUM',
    enumValues: ['EQ', 'CONTAINS', 'NEQ', 'NCONTAINS', 'LT', 'LTE', 'GT', 'GTE'],
  },
  RedirectType: {
    kind: 'ENUM',
    enumValues: ['REDIRECT_301', 'REDIRECT_302', 'SERVER_TRANSFER'],
  },

  // --- Input types ---
  ItemSearchPredicate: {
    kind: 'INPUT_OBJECT',
    inputFields: ['name', 'value', 'operator', 'AND', 'OR'],
  },
  ItemSearchOrderByInput: {
    kind: 'INPUT_OBJECT',
    inputFields: ['name', 'direction'],
  },

  // --- Query root ---
  Query: {
    kind: 'OBJECT',
    fields: ['item', 'layout', 'search', 'site'],
    fieldArgs: {
      item: ['path', 'language'],
      layout: ['site', 'routePath', 'language'],
      search: ['where', 'first', 'after', 'orderBy'],
    },
  },

  // --- Item interface ---
  Item: {
    kind: 'INTERFACE',
    fields: [
      'id', 'language', 'version', 'name', 'url', 'path', 'displayName',
      'template', 'rendered', 'hasChildren', 'children', 'parent',
      'ancestors', 'languages', 'fields', 'field',
    ],
    fieldArgs: {
      // Edge specifies id(format: String = "N") on the Item interface.
      id: ['format'],
      hasChildren: ['hasLayout', 'includeTemplateIDs'],
      children: ['hasLayout', 'includeTemplateIDs', 'first', 'after'],
      ancestors: ['hasLayout', 'includeTemplateIDs'],
      fields: ['ownFields'],
      field: ['name'],
    },
  },

  // --- UnknownItem: fallback concrete type for unmapped templates ---
  UnknownItem: {
    kind: 'OBJECT',
    fields: [
      'id', 'language', 'version', 'name', 'url', 'path', 'displayName',
      'template', 'rendered', 'hasChildren', 'children', 'parent',
      'ancestors', 'languages', 'fields', 'field',
    ],
    fieldArgs: {
      // Item.id has format arg in Edge; UnknownItem redeclares all Item fields.
      id: ['format'],
    },
  },

  // --- ItemField interface ---
  ItemField: {
    kind: 'INTERFACE',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition'],
    fieldArgs: {
      id: ['format'],
    },
  },

  // --- Field subtypes (all implement ItemField) ---
  TextField: {
    // Base/fallback for any unrecognised Sitecore field type.
    kind: 'OBJECT',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition'],
  },

  LinkField: {
    kind: 'OBJECT',
    fields: [
      'id', 'name', 'jsonValue', 'value', 'definition',
      'anchor', 'queryString', 'className', 'targetItem', 'text', 'target', 'linkType', 'url',
    ],
  },

  ImageField: {
    kind: 'OBJECT',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'src', 'alt', 'width', 'height'],
    fieldArgs: {
      src: ['maxWidth', 'maxHeight'],
    },
  },

  FileField: {
    kind: 'OBJECT',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'url'],
  },

  MediaItemField: {
    kind: 'OBJECT',
    fields: [
      'id', 'name', 'jsonValue', 'value', 'definition',
      'title', 'keywords', 'description', 'extension', 'mimeType', 'size',
    ],
  },

  DateField: {
    kind: 'OBJECT',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'formattedDateValue', 'dateValue'],
    fieldArgs: {
      formattedDateValue: ['format', 'offset'],
    },
  },

  CheckboxField: {
    kind: 'OBJECT',
    // boolValue: Boolean is declared on the ItemField interface (Mockingbird superset)
    // and redeclared on CheckboxField. Both are present in introspection.
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'boolValue'],
  },

  NumberField: {
    kind: 'OBJECT',
    // numberValue: Float is declared on the ItemField interface (Mockingbird superset)
    // and redeclared on NumberField. Both are present in introspection.
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'numberValue'],
  },

  IntegerField: {
    kind: 'OBJECT',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'intValue'],
  },

  LookupField: {
    kind: 'OBJECT',
    // targetItem: Item is on the ItemField interface (Mockingbird superset),
    // also specifically the Edge-added field for LookupField.
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'targetItem'],
  },

  MultilistField: {
    kind: 'OBJECT',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'targetIds', 'targetItems', 'count'],
  },

  NameValueListField: {
    kind: 'OBJECT',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition', 'values'],
  },

  RichTextField: {
    // Rendered HTML is exposed via the inherited value/jsonValue fields.
    kind: 'OBJECT',
    fields: ['id', 'name', 'jsonValue', 'value', 'definition'],
  },

  // --- Supporting types ---
  ItemUrl: {
    kind: 'OBJECT',
    fields: ['path', 'siteName', 'hostName', 'scheme', 'url'],
  },

  ItemLanguage: {
    kind: 'OBJECT',
    fields: ['name', 'englishName', 'nativeName', 'displayName'],
  },

  ItemTemplate: {
    kind: 'OBJECT',
    // Mockingbird superset: also exposes `id` on ItemTemplate.
    fields: ['name', 'baseTemplates', 'ownFields', 'fields'],
  },

  ItemTemplateField: {
    kind: 'OBJECT',
    fields: [
      'name', 'title', 'type', 'source',
      'shared', 'unversioned', 'sortOrder', 'section', 'sectionSortOrder',
    ],
  },

  NameValueListValue: {
    kind: 'OBJECT',
    fields: ['name', 'value'],
  },

  // --- Search / pagination ---
  ItemSearchResults: {
    kind: 'OBJECT',
    fields: ['results', 'total', 'pageInfo'],
  },

  PageInfo: {
    kind: 'OBJECT',
    fields: ['endCursor', 'hasNext'],
  },

  // --- Layout ---
  LayoutData: {
    kind: 'OBJECT',
    fields: ['item'],
  },

  // --- Sites ---
  SiteData: {
    kind: 'OBJECT',
    fields: ['siteInfo', 'siteInfoCollection', 'allSiteInfo'],
    fieldArgs: {
      siteInfo: ['site'],
      allSiteInfo: ['pageSize', 'pageNumber'],
    },
  },

  SiteInfo: {
    kind: 'OBJECT',
    fields: [
      'name', 'rootPath', 'redirects', 'errorHandling', 'routes',
      'robots', 'sitemap', 'hostname', 'language', 'attributes', 'dictionary',
    ],
    fieldArgs: {
      errorHandling: ['language'],
      routes: ['language', 'includedPaths', 'excludedPaths', 'after', 'first'],
      dictionary: ['language', 'first', 'after'],
    },
  },

  SiteInfoResult: {
    kind: 'OBJECT',
    fields: ['results', 'total'],
  },

  RoutesResult: {
    kind: 'OBJECT',
    fields: ['results', 'total', 'pageInfo'],
  },

  Route: {
    kind: 'OBJECT',
    fields: ['route', 'routePath'],
  },

  DictionaryResult: {
    kind: 'OBJECT',
    fields: ['results', 'total', 'pageInfo'],
  },

  RedirectInfo: {
    kind: 'OBJECT',
    fields: [
      'pattern', 'target', 'redirectType',
      'isQueryStringPreserved', 'isLanguagePreserved', 'locale',
    ],
  },

  ErrorHandlingInfo: {
    kind: 'OBJECT',
    fields: ['notFoundPagePath', 'notFoundPage', 'serverErrorPagePath', 'serverErrorPage'],
  },

  KeyValuePair: {
    kind: 'OBJECT',
    fields: ['key', 'value'],
  },
};

// ---------------------------------------------------------------------------
// Helpers for extracting introspection data
// ---------------------------------------------------------------------------

type IntrospectionField = {
  name: string;
  args: Array<{ name: string }>;
};

type IntrospectionType = {
  name: string;
  kind: string;
  fields: IntrospectionField[] | null;
  enumValues: Array<{ name: string }> | null;
  inputFields: Array<{ name: string }> | null;
};

// ---------------------------------------------------------------------------
// Gate tests
// ---------------------------------------------------------------------------

describe('GraphQL Edge schema introspection parity gate', () => {
  let app: FastifyInstance;
  let typeMap: Map<string, IntrospectionType>;

  beforeAll(async () => {
    app = await createTestApp();

    const introspectionQuery = `{
      __schema {
        types {
          name
          kind
          fields(includeDeprecated: true) {
            name
            args { name }
          }
          enumValues(includeDeprecated: true) {
            name
          }
          inputFields {
            name
          }
        }
      }
    }`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: { query: introspectionQuery },
    });

    expect(res.statusCode, 'Introspection query must succeed').toBe(200);
    const body = res.json();
    expect(body.errors, 'Introspection query must have no errors').toBeUndefined();

    const types: IntrospectionType[] = body.data.__schema.types;
    typeMap = new Map(types.map((t: IntrospectionType) => [t.name, t]));
  });

  afterAll(async () => {
    await app.close();
  });

  // For each expected type, assert it exists with all required elements.
  for (const [typeName, expectation] of Object.entries(EXPECTED)) {
    describe(`type ${typeName}`, () => {
      it('exists in the schema', () => {
        expect(
          typeMap.has(typeName),
          `Type "${typeName}" is missing from the schema`,
        ).toBe(true);
      });

      if (expectation.kind) {
        it(`has kind ${expectation.kind}`, () => {
          const actual = typeMap.get(typeName);
          if (!actual) return; // already failed above
          expect(actual.kind, `Type "${typeName}" has wrong kind`).toBe(expectation.kind);
        });
      }

      if (expectation.fields && expectation.fields.length > 0) {
        it('exposes all required fields', () => {
          const actual = typeMap.get(typeName);
          if (!actual) return;
          const actualFieldNames = new Set(
            (actual.fields ?? []).map((f: IntrospectionField) => f.name),
          );
          for (const requiredField of expectation.fields!) {
            expect(
              actualFieldNames.has(requiredField),
              `Type "${typeName}" is missing required field "${requiredField}"`,
            ).toBe(true);
          }
        });
      }

      if (expectation.fieldArgs) {
        for (const [fieldName, requiredArgs] of Object.entries(expectation.fieldArgs)) {
          it(`field "${fieldName}" has required arguments: ${requiredArgs.join(', ')}`, () => {
            const actual = typeMap.get(typeName);
            if (!actual) return;
            const field = (actual.fields ?? []).find(
              (f: IntrospectionField) => f.name === fieldName,
            );
            expect(
              field,
              `Type "${typeName}" is missing field "${fieldName}" (needed to check its args)`,
            ).toBeDefined();
            if (!field) return;
            const actualArgNames = new Set(field.args.map((a: { name: string }) => a.name));
            for (const requiredArg of requiredArgs) {
              expect(
                actualArgNames.has(requiredArg),
                `Type "${typeName}", field "${fieldName}" is missing required argument "${requiredArg}"`,
              ).toBe(true);
            }
          });
        }
      }

      if (expectation.enumValues && expectation.enumValues.length > 0) {
        it('has all required enum values', () => {
          const actual = typeMap.get(typeName);
          if (!actual) return;
          const actualValues = new Set(
            (actual.enumValues ?? []).map((v: { name: string }) => v.name),
          );
          for (const requiredValue of expectation.enumValues!) {
            expect(
              actualValues.has(requiredValue),
              `Enum "${typeName}" is missing required value "${requiredValue}"`,
            ).toBe(true);
          }
        });
      }

      if (expectation.inputFields && expectation.inputFields.length > 0) {
        it('has all required input fields', () => {
          const actual = typeMap.get(typeName);
          if (!actual) return;
          const actualInputFields = new Set(
            (actual.inputFields ?? []).map((f: { name: string }) => f.name),
          );
          for (const requiredInputField of expectation.inputFields!) {
            expect(
              actualInputFields.has(requiredInputField),
              `Input type "${typeName}" is missing required field "${requiredInputField}"`,
            ).toBe(true);
          }
        });
      }
    });
  }
});
