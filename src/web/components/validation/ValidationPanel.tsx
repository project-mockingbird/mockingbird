
import { useValidation } from '@/hooks/useValidation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import { mdiAlertCircle, mdiAlert, mdiClose } from '@mdi/js';
import { ValidationIssueRow } from './ValidationIssueRow';

interface ValidationPanelProps {
  onNavigate: (itemId: string) => void;
  onClose: () => void;
}

export function ValidationPanel({ onNavigate, onClose }: ValidationPanelProps) {
  const { data: validation } = useValidation();

  const errors = validation?.errors ?? [];
  const grouped: Record<string, typeof errors> = {};
  for (const e of errors) {
    (grouped[e.rule] ??= []).push(e);
  }

  return (
    <div className="h-full flex flex-col bg-card border-t">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h3 className="text-sm font-semibold">Validation ({errors.length} issues)</h3>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close validation panel">
          <Icon path={mdiClose} className="size-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {errors.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No issues. Tree is valid.</p>
        ) : (
          <Accordion type="multiple" className="px-2">
            {Object.entries(grouped).map(([rule, issues]) => (
              <AccordionItem key={rule} value={rule}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Icon
                      path={issues[0].severity === 'error' ? mdiAlertCircle : mdiAlert}
                      className="size-4"
                    />
                    {rule} ({issues.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1 text-xs">
                    {issues.map((issue, i) => (
                      <ValidationIssueRow key={i} issue={issue} onNavigate={onNavigate} />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </ScrollArea>
    </div>
  );
}
