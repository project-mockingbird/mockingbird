import { Alert, AlertDescription } from '@/components/ui/alert';

export function ReadOnlyBanner() {
  return (
    <div className="px-4 pt-2">
      <Alert variant="default">
        <AlertDescription>
          This is an OOTB Sitecore item from the registry. Editing requires materializing a YAML override (coming soon).
        </AlertDescription>
      </Alert>
    </div>
  );
}
