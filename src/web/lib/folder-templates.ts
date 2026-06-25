// Single source of truth for "folder-style" Sitecore template GUIDs.
//
// Items whose template is one of these are containers, not authorable leaves:
// the Content Editor (and Mockingbird's pickers) render them as folders even
// when they have zero children. Previously this set was duplicated in
// template-tree.ts and rendering-tree.ts; both now import from here, and the
// content tree's icon resolver uses it so an EMPTY folder still gets a folder
// icon (otherwise it falls through to a generic file/cube icon, which reads
// as a leaf item and confuses authors).
//
// All GUIDs are lowercase, brace-free. Validated against the baked OOTB
// registry where present (Node {14416946-...} is a real Sitecore template
// that simply doesn't appear in this corpus; kept for cross-corpus safety).
export const FOLDER_TEMPLATE_IDS: ReadonlySet<string> = new Set<string>([
  '0437fee2-44c9-46a6-abe9-28858d9fee8c', // Template Folder (/sitecore/templates/...)
  '7ee0975b-0698-493e-b3a2-0b2ef33d0522', // Renderings folder (SXA, under /sitecore/layout/Renderings)
  'a87a00b1-e6db-45ab-8b54-636fec3b5523', // Folder (the generic Common/Folder template)
  '14416946-9839-4651-a12b-308de9415d52', // Node (generic container, core db)
  'fe5dd826-48c6-436d-b87a-7c4210c7413b', // Media folder (/sitecore/media library/...)
]);

/**
 * True when `template` is a folder-style container template. Accepts the
 * lowercase/uppercase, brace-or-no-brace GUID stored on a node/meta and
 * normalizes before lookup. Returns false for undefined/empty input.
 */
export function isFolderTemplate(template: string | undefined | null): boolean {
  if (!template) return false;
  return FOLDER_TEMPLATE_IDS.has(template.replace(/[{}]/g, '').toLowerCase());
}
