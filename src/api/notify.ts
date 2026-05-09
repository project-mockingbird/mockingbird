import type { Engine } from '../engine/index.js';
import type { ItemChangeEvent } from '../engine/types.js';
import { broadcastItemChange, broadcastTreeRefresh, broadcastValidation } from './websocket.js';

export function notifyItemChange(engine: Engine, event: ItemChangeEvent): void {
  console.log(`[watch] ${event.type} ${event.itemPath} (${event.itemId})`);
  broadcastItemChange(event);
  setTimeout(() => broadcastValidation(engine), 100);
}

export interface TreeRefreshEvent {
  reason: 'scaffold';
  rootItemPath: string;
  createdCount: number;
}

export function notifyTreeRefresh(engine: Engine, event: TreeRefreshEvent): void {
  console.log(`[scaffold] refresh ${event.rootItemPath} (+${event.createdCount} items)`);
  broadcastTreeRefresh(event);
  setTimeout(() => broadcastValidation(engine), 100);
}
