import { describe, it, expect } from 'vitest';
import { buildEngine, makeItem } from './_helpers.js';
import { isPageDataFolder, findUnusedDatasources } from '../../../src/engine/layout/unused-datasources.js';
import { BASE_DATA_FOLDER_TEMPLATE_ID, FIELD_IDS, FINAL_RENDERINGS_FIELD_ID } from '../../../src/engine/constants.js';

describe('isPageDataFolder', () => {
  it('returns true when item template inherits from _BaseDataFolder', () => {
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';
    const folder = makeItem({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
      path: '/sitecore/content/Home/Data',
      template: dataTemplateId,
    });
    const dataTemplate = makeItem({
      id: dataTemplateId,
      path: '/sitecore/templates/Foundation/_BaseDataFolder/Data',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      sharedFields: [
        { id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` },
      ],
    });
    const baseDataFolder = makeItem({
      id: BASE_DATA_FOLDER_TEMPLATE_ID,
      path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    });
    const engine = buildEngine([folder, dataTemplate, baseDataFolder]);
    expect(isPageDataFolder(folder, engine)).toBe(true);
  });

  it('returns false when item template does not inherit from _BaseDataFolder', () => {
    const folder = makeItem({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccc01',
      path: '/sitecore/content/Home/Data',
      template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
    });
    const someTemplate = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
      path: '/sitecore/templates/Foundation/Other',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    });
    const engine = buildEngine([folder, someTemplate]);
    expect(isPageDataFolder(folder, engine)).toBe(false);
  });
});

describe('findUnusedDatasources', () => {
  it('returns empty when item has no Page Data folder child', () => {
    const home = makeItem({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccc10',
      path: '/sitecore/content/Home',
      template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10',
    });
    const engine = buildEngine([home]);
    const result = findUnusedDatasources(home.id, engine);
    expect(result).toEqual({ count: 0, items: [] });
  });

  it('recognizes GUID, absolute, and local: datasource forms', () => {
    const homeId = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
    const dataFolderId = 'dddddddd-dddd-dddd-dddd-dddddddddd02';
    const guidTargetId = 'dddddddd-dddd-dddd-dddd-dddddddddd03';
    const absTargetId = 'dddddddd-dddd-dddd-dddd-dddddddddd04';
    const localTargetId = 'dddddddd-dddd-dddd-dddd-dddddddddd05';
    const orphanId = 'dddddddd-dddd-dddd-dddd-dddddddddd06';

    const baseDataFolder = makeItem({ id: BASE_DATA_FOLDER_TEMPLATE_ID, path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' });
    const dataTemplate = makeItem({ id: dataTemplateId, path: '/sitecore/templates/Foundation/_BaseDataFolder/Data', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', sharedFields: [{ id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` }] });
    const xml = `<r xmlns:p="p" xmlns:s="s" p:p="p"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">` +
      `<r uid="{D1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="x" s:ds="{${guidTargetId}}" s:par="" />` +
      `<r uid="{D2}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="x" s:ds="/sitecore/content/Home/Data/abs-target" s:par="" />` +
      `<r uid="{D3}" s:id="{33333333-3333-3333-3333-333333333333}" s:ph="x" s:ds="local:Data/local-target" s:par="" />` +
      `</d></r>`;
    const home = makeItem({
      id: homeId, path: '/sitecore/content/Home', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      languages: [{ language: 'en', versions: [{ version: 1, fields: [{ id: FINAL_RENDERINGS_FIELD_ID, value: xml }] }] }],
    });
    const dataFolder = makeItem({ id: dataFolderId, parent: homeId, path: '/sitecore/content/Home/Data', template: dataTemplateId });
    const guidTarget = makeItem({ id: guidTargetId, parent: dataFolderId, path: '/sitecore/content/Home/Data/guid-target', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const absTarget = makeItem({ id: absTargetId, parent: dataFolderId, path: '/sitecore/content/Home/Data/abs-target', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const localTarget = makeItem({ id: localTargetId, parent: dataFolderId, path: '/sitecore/content/Home/Data/local-target', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const orphan = makeItem({ id: orphanId, parent: dataFolderId, path: '/sitecore/content/Home/Data/orphan', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

    const engine = buildEngine([baseDataFolder, dataTemplate, home, dataFolder, guidTarget, absTarget, localTarget, orphan]);
    const result = findUnusedDatasources(home.id, engine);

    expect(result.count).toBe(1);
    expect(result.items[0].id).toBe(orphanId);
  });

  it('keeps descendants when parent is referenced (transitive)', () => {
    const homeId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
    const dataFolderId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
    const setId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03';
    const slide1Id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
    const slide2Id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05';

    const baseDataFolder = makeItem({ id: BASE_DATA_FOLDER_TEMPLATE_ID, path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' });
    const dataTemplate = makeItem({ id: dataTemplateId, path: '/sitecore/templates/Foundation/_BaseDataFolder/Data', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', sharedFields: [{ id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` }] });
    const xml = `<r><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">` +
      `<r uid="{T1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="x" s:ds="local:Data/CarouselSet" s:par="" /></d></r>`;
    const home = makeItem({ id: homeId, path: '/sitecore/content/Home', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', languages: [{ language: 'en', versions: [{ version: 1, fields: [{ id: FINAL_RENDERINGS_FIELD_ID, value: xml }] }] }] });
    const dataFolder = makeItem({ id: dataFolderId, parent: homeId, path: '/sitecore/content/Home/Data', template: dataTemplateId });
    const set = makeItem({ id: setId, parent: dataFolderId, path: '/sitecore/content/Home/Data/CarouselSet', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const slide1 = makeItem({ id: slide1Id, parent: setId, path: '/sitecore/content/Home/Data/CarouselSet/Slide1', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const slide2 = makeItem({ id: slide2Id, parent: setId, path: '/sitecore/content/Home/Data/CarouselSet/Slide2', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

    const engine = buildEngine([baseDataFolder, dataTemplate, home, dataFolder, set, slide1, slide2]);
    const result = findUnusedDatasources(home.id, engine);
    expect(result).toEqual({ count: 0, items: [] });
  });

  it('strict miss: reference child only marks unreferenced sibling as unused', () => {
    const homeId = 'ffffffff-ffff-ffff-ffff-ffffffffff01';
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
    const dataFolderId = 'ffffffff-ffff-ffff-ffff-ffffffffff02';
    const setId = 'ffffffff-ffff-ffff-ffff-ffffffffff03';
    const slide1Id = 'ffffffff-ffff-ffff-ffff-ffffffffff04';
    const slide2Id = 'ffffffff-ffff-ffff-ffff-ffffffffff05';

    const baseDataFolder = makeItem({ id: BASE_DATA_FOLDER_TEMPLATE_ID, path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' });
    const dataTemplate = makeItem({ id: dataTemplateId, path: '/sitecore/templates/Foundation/_BaseDataFolder/Data', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', sharedFields: [{ id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` }] });
    const xml = `<r><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">` +
      `<r uid="{S1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="x" s:ds="local:Data/CarouselSet/Slide1" s:par="" /></d></r>`;
    const home = makeItem({ id: homeId, path: '/sitecore/content/Home', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', languages: [{ language: 'en', versions: [{ version: 1, fields: [{ id: FINAL_RENDERINGS_FIELD_ID, value: xml }] }] }] });
    const dataFolder = makeItem({ id: dataFolderId, parent: homeId, path: '/sitecore/content/Home/Data', template: dataTemplateId });
    const set = makeItem({ id: setId, parent: dataFolderId, path: '/sitecore/content/Home/Data/CarouselSet', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const slide1 = makeItem({ id: slide1Id, parent: setId, path: '/sitecore/content/Home/Data/CarouselSet/Slide1', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const slide2 = makeItem({ id: slide2Id, parent: setId, path: '/sitecore/content/Home/Data/CarouselSet/Slide2', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

    const engine = buildEngine([baseDataFolder, dataTemplate, home, dataFolder, set, slide1, slide2]);
    const result = findUnusedDatasources(home.id, engine);
    expect(result.count).toBe(1);
    expect(result.items[0].id).toBe(slide2Id);
  });

  it('unions referenced ids across all languages and versions', () => {
    const homeId = '11111111-aaaa-aaaa-aaaa-111111111101';
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4';
    const dataFolderId = '11111111-aaaa-aaaa-aaaa-111111111102';
    const enRefId = '11111111-aaaa-aaaa-aaaa-111111111103';
    const jpRefId = '11111111-aaaa-aaaa-aaaa-111111111104';
    const orphanId = '11111111-aaaa-aaaa-aaaa-111111111105';

    const baseDataFolder = makeItem({ id: BASE_DATA_FOLDER_TEMPLATE_ID, path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' });
    const dataTemplate = makeItem({ id: dataTemplateId, path: '/sitecore/templates/Foundation/_BaseDataFolder/Data', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', sharedFields: [{ id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` }] });
    const enXml = `<r><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{E1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="x" s:ds="local:Data/en-ref" s:par="" /></d></r>`;
    const jpXml = `<r><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{J1}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="x" s:ds="local:Data/jp-ref" s:par="" /></d></r>`;
    const home = makeItem({
      id: homeId, path: '/sitecore/content/Home', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      languages: [
        { language: 'en', versions: [{ version: 1, fields: [{ id: FINAL_RENDERINGS_FIELD_ID, value: enXml }] }] },
        { language: 'jp', versions: [{ version: 1, fields: [{ id: FINAL_RENDERINGS_FIELD_ID, value: jpXml }] }] },
      ],
    });
    const dataFolder = makeItem({ id: dataFolderId, parent: homeId, path: '/sitecore/content/Home/Data', template: dataTemplateId });
    const enRef = makeItem({ id: enRefId, parent: dataFolderId, path: '/sitecore/content/Home/Data/en-ref', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const jpRef = makeItem({ id: jpRefId, parent: dataFolderId, path: '/sitecore/content/Home/Data/jp-ref', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const orphan = makeItem({ id: orphanId, parent: dataFolderId, path: '/sitecore/content/Home/Data/orphan', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

    const engine = buildEngine([baseDataFolder, dataTemplate, home, dataFolder, enRef, jpRef, orphan]);
    const result = findUnusedDatasources(home.id, engine);
    expect(result.count).toBe(1);
    expect(result.items[0].id).toBe(orphanId);
  });

  it('broken refs are silently dropped, not crash', () => {
    const homeId = '22222222-aaaa-aaaa-aaaa-222222222201';
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5';
    const dataFolderId = '22222222-aaaa-aaaa-aaaa-222222222202';
    const orphanId = '22222222-aaaa-aaaa-aaaa-222222222203';

    const baseDataFolder = makeItem({ id: BASE_DATA_FOLDER_TEMPLATE_ID, path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' });
    const dataTemplate = makeItem({ id: dataTemplateId, path: '/sitecore/templates/Foundation/_BaseDataFolder/Data', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', sharedFields: [{ id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` }] });
    const xml = `<r><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{B1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="x" s:ds="local:Data/Missing" s:par="" /></d></r>`;
    const home = makeItem({ id: homeId, path: '/sitecore/content/Home', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', languages: [{ language: 'en', versions: [{ version: 1, fields: [{ id: FINAL_RENDERINGS_FIELD_ID, value: xml }] }] }] });
    const dataFolder = makeItem({ id: dataFolderId, parent: homeId, path: '/sitecore/content/Home/Data', template: dataTemplateId });
    const orphan = makeItem({ id: orphanId, parent: dataFolderId, path: '/sitecore/content/Home/Data/orphan', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const engine = buildEngine([baseDataFolder, dataTemplate, home, dataFolder, orphan]);

    const result = findUnusedDatasources(home.id, engine);
    expect(result.count).toBe(1);
    expect(result.items[0].id).toBe(orphanId);
  });

  it('out-of-Data refs do NOT appear as unused (not in subtree)', () => {
    const homeId = '33333333-aaaa-aaaa-aaaa-333333333301';
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6';
    const dataFolderId = '33333333-aaaa-aaaa-aaaa-333333333302';
    const otherId = '33333333-aaaa-aaaa-aaaa-333333333303';

    const baseDataFolder = makeItem({ id: BASE_DATA_FOLDER_TEMPLATE_ID, path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' });
    const dataTemplate = makeItem({ id: dataTemplateId, path: '/sitecore/templates/Foundation/_BaseDataFolder/Data', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', sharedFields: [{ id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` }] });
    const xml = `<r><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{O1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="x" s:ds="/sitecore/content/Other/Stuff" s:par="" /></d></r>`;
    const home = makeItem({ id: homeId, path: '/sitecore/content/Home', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', languages: [{ language: 'en', versions: [{ version: 1, fields: [{ id: FINAL_RENDERINGS_FIELD_ID, value: xml }] }] }] });
    const dataFolder = makeItem({ id: dataFolderId, parent: homeId, path: '/sitecore/content/Home/Data', template: dataTemplateId });
    const other = makeItem({ id: otherId, path: '/sitecore/content/Other/Stuff', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const engine = buildEngine([baseDataFolder, dataTemplate, home, dataFolder, other]);

    const result = findUnusedDatasources(home.id, engine);
    expect(result).toEqual({ count: 0, items: [] });
  });

  it('no presentation -> no banner (gate 2 fails)', () => {
    const homeId = '44444444-aaaa-aaaa-aaaa-444444444401';
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7';
    const dataFolderId = '44444444-aaaa-aaaa-aaaa-444444444402';
    const orphanId = '44444444-aaaa-aaaa-aaaa-444444444403';

    const baseDataFolder = makeItem({ id: BASE_DATA_FOLDER_TEMPLATE_ID, path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' });
    const dataTemplate = makeItem({ id: dataTemplateId, path: '/sitecore/templates/Foundation/_BaseDataFolder/Data', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', sharedFields: [{ id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` }] });
    const home = makeItem({ id: homeId, path: '/sitecore/content/Home', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', languages: [] });
    const dataFolder = makeItem({ id: dataFolderId, parent: homeId, path: '/sitecore/content/Home/Data', template: dataTemplateId });
    const orphan = makeItem({ id: orphanId, parent: dataFolderId, path: '/sitecore/content/Home/Data/orphan', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const engine = buildEngine([baseDataFolder, dataTemplate, home, dataFolder, orphan]);

    const result = findUnusedDatasources(home.id, engine);
    expect(result).toEqual({ count: 0, items: [] });
  });

  it('renderings exist but reference nothing -> ALL Data items unused', () => {
    const homeId = '55555555-aaaa-aaaa-aaaa-555555555501';
    const dataTemplateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8';
    const dataFolderId = '55555555-aaaa-aaaa-aaaa-555555555502';
    const orphanAId = '55555555-aaaa-aaaa-aaaa-555555555503';
    const orphanBId = '55555555-aaaa-aaaa-aaaa-555555555504';

    const baseDataFolder = makeItem({ id: BASE_DATA_FOLDER_TEMPLATE_ID, path: '/sitecore/templates/Foundation/Multisite/_BaseDataFolder', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' });
    const dataTemplate = makeItem({ id: dataTemplateId, path: '/sitecore/templates/Foundation/_BaseDataFolder/Data', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', sharedFields: [{ id: FIELD_IDS.baseTemplate, value: `{${BASE_DATA_FOLDER_TEMPLATE_ID}}` }] });
    const xml = `<r><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{N1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="x" s:ds="" s:par="" /></d></r>`;
    const home = makeItem({ id: homeId, path: '/sitecore/content/Home', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', languages: [{ language: 'en', versions: [{ version: 1, fields: [{ id: FINAL_RENDERINGS_FIELD_ID, value: xml }] }] }] });
    const dataFolder = makeItem({ id: dataFolderId, parent: homeId, path: '/sitecore/content/Home/Data', template: dataTemplateId });
    const orphanA = makeItem({ id: orphanAId, parent: dataFolderId, path: '/sitecore/content/Home/Data/orphan-a', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const orphanB = makeItem({ id: orphanBId, parent: dataFolderId, path: '/sitecore/content/Home/Data/orphan-b', template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const engine = buildEngine([baseDataFolder, dataTemplate, home, dataFolder, orphanA, orphanB]);

    const result = findUnusedDatasources(home.id, engine);
    expect(result.count).toBe(2);
    expect(result.items.map(i => i.id).sort()).toEqual([orphanAId, orphanBId].sort());
  });
});
