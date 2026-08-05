/**
 * Sitecore field-type string -> GraphQL concrete field-type name.
 *
 * Single source of truth shared by the runtime `ItemField` resolveType dispatch
 * (`src/api/routes/graphql.ts`) and the static per-template schema generator
 * (`src/engine/schema/generate.ts`). Real Experience Edge assigns each generated
 * template field its concrete GraphQL type from the Sitecore field type via
 * `FieldTypeMapping` (Sitecore.Services.GraphQL.Content, decompiled); anything
 * not listed falls back to `TextField` (the base/fallback field subtype).
 */
export const FIELD_TYPE_TO_GQL: Record<string, string> = {
  'general link': 'LinkField', 'link': 'LinkField',
  'image': 'ImageField', 'file': 'FileField', 'media item': 'MediaItemField',
  'date': 'DateField', 'datetime': 'DateField',
  'checkbox': 'CheckboxField',
  'number': 'NumberField', 'integer': 'IntegerField',
  'droplink': 'LookupField', 'droptree': 'LookupField', 'reference': 'LookupField',
  'multilist': 'MultilistField', 'treelist': 'MultilistField', 'checklist': 'MultilistField',
  'name value list': 'NameValueListField', 'name lookup value list': 'NameValueListField',
  'rich text': 'RichTextField',
};

/** The fallback field subtype for any Sitecore type not in {@link FIELD_TYPE_TO_GQL}. */
export const FALLBACK_FIELD_TYPE = 'TextField';

/**
 * Map a Sitecore field type (any casing / surrounding whitespace) to its
 * GraphQL field-type name, falling back to `TextField`.
 */
export function sitecoreFieldTypeToGraphQLType(sitecoreType: string | undefined): string {
  if (!sitecoreType) return FALLBACK_FIELD_TYPE;
  return FIELD_TYPE_TO_GQL[sitecoreType.trim().toLowerCase()] ?? FALLBACK_FIELD_TYPE;
}
