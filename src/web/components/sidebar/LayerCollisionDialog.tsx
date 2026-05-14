import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface LayerCollisionDialogProps {
  /**
   * Name of the existing project whose layer set matches the proposed new set.
   * Null when no collision is pending (dialog stays closed).
   */
  collidingProjectName: string | null;
  onSwitch: () => void;
  onCancel: () => void;
}

/**
 * Shown when the user proposes a layer change that would produce a layer set
 * identical to another saved project. Two actions:
 *   - Switch to existing: opens the colliding project, abandoning the in-progress edit.
 *   - Cancel: leaves the engine in its current state, no mutation applied.
 */
export function LayerCollisionDialog({
  collidingProjectName,
  onSwitch,
  onCancel,
}: LayerCollisionDialogProps) {
  const open = collidingProjectName !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project already exists</DialogTitle>
          <DialogDescription>
            A saved project named "{collidingProjectName}" already has this exact
            layer set. Switch to it instead, or cancel and leave the current
            project unchanged?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onSwitch}>Switch to existing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
