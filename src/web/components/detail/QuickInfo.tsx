
import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FieldLabel } from '@/components/ui/field';
import { Icon } from '@/lib/icon';
import { mdiContentCopy, mdiCheck } from '@mdi/js';
import type { ItemDetail } from '@/lib/types';
import { OpenInEditorButton } from './OpenInEditorButton';

interface QuickInfoProps {
  item: ItemDetail;
  onNavigate?: (id: string) => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Icon path={copied ? mdiCheck : mdiContentCopy} className="size-3" />
    </button>
  );
}

export function QuickInfo({ item, onNavigate }: QuickInfoProps) {
  const bracedId = `{${item.id.toUpperCase()}}`;
  const templateDisplay = item.templateResolved ?? item.template;

  return (
    <Accordion type="multiple" defaultValue={['quick-info']}>
      <AccordionItem value="quick-info">
        <AccordionTrigger>Quick Info</AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 p-2 text-xs">
            <FieldLabel className="text-xs">Item ID</FieldLabel>
            <span className="inline-flex items-center gap-1.5 font-mono break-all">
              {bracedId}
              <CopyButton value={bracedId} />
            </span>

            <FieldLabel className="text-xs">Name</FieldLabel>
            <span className="break-all">{item.name}</span>

            <FieldLabel className="text-xs">Path</FieldLabel>
            <span className="inline-flex items-center gap-1.5 break-all">
              {item.path}
              <CopyButton value={item.path} />
            </span>

            <FieldLabel className="text-xs">Template</FieldLabel>
            {onNavigate ? (
              <button
                type="button"
                className="break-all text-left text-primary hover:underline"
                title="Open template in tree"
                onClick={() => onNavigate(item.template)}
              >
                {templateDisplay}
              </button>
            ) : (
              <span className="break-all">{templateDisplay}</span>
            )}

            <FieldLabel className="text-xs">File</FieldLabel>
            <span className="inline-flex items-center gap-1.5 break-all">
              {item.filePath}
              {item.filePath && <CopyButton value={item.filePath} />}
              <OpenInEditorButton filePath={item.filePath} />
            </span>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
