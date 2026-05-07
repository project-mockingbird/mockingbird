import type { ValidationError } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface ValidationIssueRowProps {
  issue: ValidationError;
  onNavigate: (itemId: string) => void;
}

export function ValidationIssueRow({ issue, onNavigate }: ValidationIssueRowProps) {
  const primary = issue.itemPath || issue.filePath;
  const secondary = issue.itemPath ? issue.filePath : undefined;
  const { itemId } = issue;

  return (
    <li>
      {itemId ? (
        <Button
          variant="link"
          size="sm"
          onClick={() => onNavigate(itemId)}
          className="text-left h-auto py-1 px-0"
        >
          {primary}
        </Button>
      ) : (
        <span className="text-sm">{primary}</span>
      )}
      {secondary && <p className="text-xs text-muted-foreground">{secondary}</p>}
      <p className="text-xs text-muted-foreground pl-3">{issue.message}</p>
    </li>
  );
}
