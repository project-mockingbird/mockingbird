
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useSettings } from '@/settings/SettingsProvider';

interface VersionTrimmerProps {
  item: { id: string; languages: Array<{ language: string; versions: Array<{ version: number }> }> };
  language: string;
}

export function VersionTrimmer({ item, language }: VersionTrimmerProps) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const keepCount = settings['versioning.trimKeepCount'];
  const threshold = settings['versioning.trimWarnThreshold'];
  const lang = item.languages.find(l => l.language === language);
  const versionCount = lang?.versions.length ?? 0;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const trimMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/items/${item.id}/trim-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, keepCount }),
      });
      if (!res.ok) throw new Error(`Trim failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Trimmed to ${keepCount} versions (${versionCount - keepCount} removed)`);
      queryClient.invalidateQueries({ queryKey: ['item', item.id] });
    },
    onError: (err) => toast.error(`Trim failed: ${err instanceof Error ? err.message : String(err)}`),
  });

  if (versionCount <= threshold) return null;

  const removedCount = versionCount - keepCount;

  return (
    <>
      <Alert variant="warning">
        <AlertTitle>{versionCount} versions for {language}</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>Trimming to {keepCount} reduces save latency. Older versions will be discarded.</span>
          <Button
            size="sm"
            variant="outline"
            disabled={trimMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {trimMutation.isPending ? 'Trimming...' : 'Trim'}
          </Button>
        </AlertDescription>
      </Alert>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trim {language} versions?</AlertDialogTitle>
            <AlertDialogDescription>
              Keeps the {keepCount} most recent versions. {removedCount} older {removedCount === 1 ? 'version' : 'versions'} will be permanently removed from the YAML.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => trimMutation.mutate()}
            >
              Trim {removedCount}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
