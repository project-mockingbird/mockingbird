import { describe, it, expect, vi } from 'vitest';
import { dispatchAction, type ActionPorts } from '../../../src/engine/scaffolding/actions.js';
import type { ScaffoldingAction } from '../../../src/engine/scaffolding/types.js';

function buildMockPorts(): ActionPorts {
  return {
    invokeAddBaseTemplate: vi.fn().mockResolvedValue(undefined),
    invokeAddInsertOptionsToTemplate: vi.fn().mockResolvedValue(undefined),
    invokeAddInsertOptionAdvanced: vi.fn().mockResolvedValue(undefined),
    invokeAddItem: vi.fn().mockResolvedValue('new-item-id'),
    invokeExecuteScript: vi.fn().mockResolvedValue(undefined),
  };
}

function buildCtx(ports: ActionPorts) {
  return {
    ports,
    engine: {} as never,
    contextItemId: 'tenant-id',
    contextItemPath: '/sitecore/content/Tenant',
    tenantTemplates: [],
    language: 'en',
    warnings: [] as string[],
    updateTemplate: false,
  };
}

describe('dispatchAction', () => {
  it('routes EditTenantTemplate.AddBaseTemplate to invokeAddBaseTemplate', async () => {
    const ports = buildMockPorts();
    const action: ScaffoldingAction = {
      kind: 'EditTenantTemplate',
      editType: 'AddBaseTemplate',
      prototypeId: 'tpl-a',
      argumentIds: ['tpl-b'],
    };
    await dispatchAction(action, buildCtx(ports));
    expect(ports.invokeAddBaseTemplate).toHaveBeenCalledOnce();
    expect(ports.invokeAddInsertOptionsToTemplate).not.toHaveBeenCalled();
    expect(ports.invokeAddInsertOptionAdvanced).not.toHaveBeenCalled();
  });

  it('routes EditTenantTemplate.AddInsertOptions to invokeAddInsertOptionsToTemplate', async () => {
    const ports = buildMockPorts();
    const action: ScaffoldingAction = {
      kind: 'EditTenantTemplate',
      editType: 'AddInsertOptions',
      prototypeId: 'tpl-a',
      argumentIds: ['tpl-b'],
    };
    await dispatchAction(action, buildCtx(ports));
    expect(ports.invokeAddInsertOptionsToTemplate).toHaveBeenCalledOnce();
  });

  it('routes EditTenantTemplate.AddTenantTemplatesToInsertOptions to invokeAddInsertOptionAdvanced', async () => {
    const ports = buildMockPorts();
    const action: ScaffoldingAction = {
      kind: 'EditTenantTemplate',
      editType: 'AddTenantTemplatesToInsertOptions',
      prototypeId: 'tpl-a',
      argumentIds: ['tpl-b'],
    };
    await dispatchAction(action, buildCtx(ports));
    expect(ports.invokeAddInsertOptionAdvanced).toHaveBeenCalledOnce();
  });

  it('routes AddItem to invokeAddItem', async () => {
    const ports = buildMockPorts();
    const action: ScaffoldingAction = {
      kind: 'AddItem',
      locationTemplateId: 'loc-tpl',
      templateId: 'tpl',
      name: 'Foo',
      fieldUpdates: [],
    };
    await dispatchAction(action, buildCtx(ports));
    expect(ports.invokeAddItem).toHaveBeenCalledOnce();
  });

  it('logs warning + delegates ExecuteScript to its port (default port is no-op)', async () => {
    const ports = buildMockPorts();
    const action: ScaffoldingAction = { kind: 'ExecuteScript', scriptId: 'foo' };
    const ctx = buildCtx(ports);
    await dispatchAction(action, ctx);
    expect(ports.invokeExecuteScript).toHaveBeenCalledOnce();
    expect(ctx.warnings.length).toBe(1);
    expect(ctx.warnings[0]).toMatch(/ExecuteScript action skipped/);
    expect(ctx.warnings[0]).toMatch(/foo/);
  });

  it('throws ScaffoldError for unknown EditType', async () => {
    const ports = buildMockPorts();
    const action = {
      kind: 'EditTenantTemplate',
      editType: 'BogusEditType',
      prototypeId: 'tpl-a',
      argumentIds: ['tpl-b'],
    } as unknown as ScaffoldingAction;
    await expect(dispatchAction(action, buildCtx(ports))).rejects.toThrow(/Unknown EditTenantTemplate.editType/);
  });
});
