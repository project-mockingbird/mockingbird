// src/web/lib/template-ids.ts
//
// Well-known Sitecore template + path ids used across the web app. Mirrors
// src/engine/constants.ts (the engine is canonical; keep these in sync).

/** "Template" template ({AB86861A}) - items of this template ARE templates. */
export const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';

/** Branch template ({35E75C72}). */
export const BRANCH_TEMPLATE_ID = '35e75c72-4985-4e09-88c3-0eac6cd1e64f';

/** Standard template ({1930BBEB}) - the default base for a new template. */
export const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';

/** Root of the templates tree; base-template pickers are rooted here. */
export const TEMPLATES_ROOT_PATH = '/sitecore/templates';
