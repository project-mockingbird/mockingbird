
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icon';
import { mdiDatabase, mdiChevronDown } from '@mdi/js';
import packageJson from '../../../../package.json';

interface StatusBarProps {
  database: string;
  onDatabaseChange: (db: string) => void;
}

export function StatusBar({ database, onDatabaseChange }: StatusBarProps) {
  return (
    <footer className="flex items-center justify-between border-t bg-card px-4 py-1 h-8 text-xs shrink-0">
      <div className="flex items-center gap-2">
        <Badge colorScheme="neutral">v{packageJson.version}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Icon path={mdiDatabase} className="size-3 mr-1" />
              {database}
              <Icon path={mdiChevronDown} className="size-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDatabaseChange('master')}>master</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDatabaseChange('core')}>core</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </footer>
  );
}
