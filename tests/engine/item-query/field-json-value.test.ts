import { describe, it, expect } from 'vitest';
import { buildJsonValue, lookupFieldType } from '../../../src/engine/item-query/field-json-value.js';
import { buildEngine, makeItem } from '../layout/_helpers.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';

describe('buildJsonValue — empty-field jsonValue shape', () => {
  const engine = buildEngine([]);

  it('returns { value: { href: "" } } for an empty general-link field', () => {
    // Empty authored Link emits `{href:""}` in Sitecore; the 0.4.0
    // collapse to `{value:{}}` regressed this.
    expect(buildJsonValue('', engine, '', 'general link')).toEqual({ value: { href: '' } });
  });

  it('returns { value: { href: "" } } for a whitespace-only general-link field', () => {
    expect(buildJsonValue('   ', engine, '', 'general link')).toEqual({ value: { href: '' } });
  });

  it('returns { value: {} } for an empty image field', () => {
    // Image empty contract stays `{}` — prod does not inject `src:""` when
    // the field is wholly unauthored. Confirms the split doesn't regress
    // the image side.
    expect(buildJsonValue('', engine, '', 'image')).toEqual({ value: {} });
  });

  it('returns { value: {} } when image mediaid does not resolve', () => {
    // Processor renders "" for unresolvable mediaid → emptyImageJsonValue.
    const value = '<image mediaid="{00000000-0000-0000-0000-000000000001}" />';
    expect(buildJsonValue(value, engine, '', 'image')).toEqual({ value: {} });
  });
});

describe('lookupFieldType - FaqItem.Answer case (0.4.0.32)', () => {
  // Regression guard against a 0.4.0.31 escape: FaqItem's Answer
  // field is declared as "Rich Text" on the template-field item but
  // `lookupFieldType(item, 'Answer', engine)` was returning `''`,
  // so `readHint` wasn't routing the value through rewriteRichText. This
  // test reproduces the site template shape: FaqItem template -> /FAQ
  // section (template) -> /Answer field (template) with Type="Rich Text".
  // Pins the lookup returns "rich text" (lowercased).

  it("resolves Answer as 'rich text' when field is defined on a section child of the item's template", () => {
    const faqTemplateId = 'dd750ccd-db3f-4eae-b0c3-b2b97f3d2cf5';
    const faqSectionId = '8962eb96-f97b-48db-bd34-57f132b9793c';
    const answerFieldId = '3e54987c-b192-4e6b-b4d6-912db58a7099';

    const faqTemplate = makeItem({
      id: faqTemplateId,
      path: '/sitecore/templates/Project/site/Faqs/Faq Item',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const faqSection = makeItem({
      id: faqSectionId,
      parent: faqTemplateId,
      path: '/sitecore/templates/Project/site/Faqs/Faq Item/FAQ',
      template: TEMPLATE_SECTION_TEMPLATE_ID,
    });
    const answerField = makeItem({
      id: answerFieldId,
      parent: faqSectionId,
      path: '/sitecore/templates/Project/site/Faqs/Faq Item/FAQ/Answer',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [
        { id: FIELD_IDS.type, hint: 'Type', value: 'Rich Text' },
      ],
    });

    const item = makeItem({
      id: 'aaaa1111-0000-0000-0000-000000000001',
      path: '/sitecore/content/site/Home/Faqs/Faq-Item-1',
      template: faqTemplateId,
    });
    const engine = buildEngine([faqTemplate, faqSection, answerField, item]);

    expect(lookupFieldType(item, 'Answer', engine)).toBe('rich text');
  });
});
