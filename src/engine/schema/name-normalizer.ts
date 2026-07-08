/**
 * Faithful port of Sitecore's GraphQL identifier normalization
 * (Sitecore.Services.GraphQL.Content.Helpers.NameNormalizer.NormalizeString +
 * TemplateMetadataGenerator.GraphQLTypeize/GraphQLFieldize, decompiled from
 * ContentSchema 8.0.10). Underscores are preserved; only SPACES split words;
 * only the first char of each word is re-cased. This makes f_/T_ prefixed
 * Sitecore names round-trip to the same GraphQL names real Edge exposes.
 */
export function normalizeString(name: string): string {
  if (!name) return '';
  let n = name;
  if (n.startsWith('__')) n = n.slice(2);
  const words = n.split(' ').filter(w => w.length > 0);
  for (let i = 0; i < words.length; i++) {
    const cleaned = words[i].replace(/[^_a-zA-Z0-9]/g, '');
    words[i] = cleaned === '' ? '' : cleaned[0].toUpperCase() + cleaned.slice(1);
  }
  let text = words.join('');
  if (text.length === 0) return '';
  if (text[0] >= '0' && text[0] <= '9') text = '_' + text;
  return text;
}

export function graphqlTypeize(name: string): string {
  return normalizeString(name);
}

export function graphqlFieldize(name: string): string {
  const text = normalizeString(name);
  return text.length === 0 ? '' : text[0].toLowerCase() + text.slice(1);
}
