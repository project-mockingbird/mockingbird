// src/web/components/tree/DialogParentPath.tsx
//
// Small reusable parent-path block for tree-action dialogs (Insert /
// Duplicate / Create section / Create field). Matches the pattern
// established in InsertDialogWithTemplateDropdown so all dialogs that
// mutate the tree under a parent display the parent's path consistently.
//
// Usage: drop this between <DialogHeader> and the dialog body content.

export interface DialogParentPathProps {
  parentPath: string;
  label?: string; // defaults to "Parent"
}

export function DialogParentPath({ parentPath, label = 'Parent' }: DialogParentPathProps) {
  return (
    <div className="text-sm mb-3">
      <span className="block mb-1 text-muted-foreground">{label}</span>
      <div
        className="rounded border bg-muted/50 px-2 py-1.5 text-xs font-mono text-muted-foreground break-all"
        title={parentPath}
      >
        {parentPath}
      </div>
    </div>
  );
}
