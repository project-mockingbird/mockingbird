import { describe, it, expect } from 'vitest';
import { toUpdateCommandData } from '../../../src/engine/sitecoreai/serialize-command.js';
import type { ItemUpdateOp } from '../../../src/engine/sitecoreai/types.js';

describe('toUpdateCommandData', () => {
  it('serializes ops to the exact executeSerializationCommands UPDATE wire shape', () => {
    const ops: ItemUpdateOp[] = [
      { kind: 'changeTemplate', templateId: 't-guid' },
      { kind: 'addVersion', language: 'en', version: 2 },
      { kind: 'removeVersion', language: 'en', version: 3 },
      { kind: 'resetField', fieldId: 'f1', language: 'en', version: 1 },
      { kind: 'updateField', fieldId: 'f2', value: 'v', blobId: 'b', language: 'en', version: 1 },
      { kind: 'updateField', fieldId: 'shared', value: 'x' },
    ];
    expect(JSON.parse(toUpdateCommandData(ops))).toEqual([
      { command: 'CHANGE_TEMPLATE', data: 't-guid' },
      { command: 'ADD_VERSION', data: { language: 'en', version: '2' } },
      { command: 'REMOVE_VERSION', data: { language: 'en', version: '3' } },
      { command: 'RESET_FIELD', data: { fieldId: 'f1', language: 'en', version: '1' } },
      { command: 'UPDATE', data: { fieldId: 'f2', value: 'v', blobId: 'b', language: 'en', version: '1' } },
      { command: 'UPDATE', data: { fieldId: 'shared', value: 'x' } },
    ]);
  });

  it('omits blobId/language/version when absent', () => {
    const ops: ItemUpdateOp[] = [{ kind: 'updateField', fieldId: 'f', value: 'v' }];
    expect(JSON.parse(toUpdateCommandData(ops))).toEqual([{ command: 'UPDATE', data: { fieldId: 'f', value: 'v' } }]);
  });
});
