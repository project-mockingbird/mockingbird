import type { Engine } from '../engine/index.js';
import type { ItemChangeEvent } from '../engine/types.js';
import { broadcastItemChange, broadcastValidation } from './websocket.js';

export function notifyItemChange(engine: Engine, event: ItemChangeEvent): void {
  console.log(`[watch] ${event.type} ${event.itemPath} (${event.itemId})`);
  broadcastItemChange(event);
  setTimeout(() => broadcastValidation(engine), 100);
}
