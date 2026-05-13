/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProvenanceBar } from './ProvenanceBar';

describe('<ProvenanceBar>', () => {
  const colors = { authoring: '#22c55e', content: '#3b82f6', ootb: '#cbd5e1' };
  const allVisible = { authoring: true, content: true, ootb: true };

  it('renders one stripe per contributing layer', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'content', contributingLayers: ['authoring', 'content'] }}
        layerColors={colors}
        layerVisibility={allVisible}
      />,
    );
    expect(container.querySelectorAll('[data-prov-stripe]').length).toBe(2);
  });

  it('filters out toggled-off contributors', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'content', contributingLayers: ['authoring', 'content'] }}
        layerColors={colors}
        layerVisibility={{ authoring: false, content: true, ootb: true }}
      />,
    );
    expect(container.querySelectorAll('[data-prov-stripe]').length).toBe(1);
  });

  it('renders null when all contributors are off', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'content', contributingLayers: ['authoring', 'content'] }}
        layerColors={colors}
        layerVisibility={{ authoring: false, content: false, ootb: true }}
      />,
    );
    // Component returns null - the container holds no child nodes
    expect(container.firstChild).toBeNull();
  });

  it('renders the winner as the rightmost stripe (last in DOM order)', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'content', contributingLayers: ['authoring', 'content'] }}
        layerColors={colors}
        layerVisibility={allVisible}
      />,
    );
    const stripes = container.querySelectorAll<HTMLElement>('[data-prov-stripe]');
    expect(stripes[stripes.length - 1].dataset.layerName).toBe('content');
  });

  it('single-layer stripe is 4px wide', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'authoring', contributingLayers: ['authoring'] }}
        layerColors={colors}
        layerVisibility={allVisible}
      />,
    );
    const stripe = container.querySelector<HTMLElement>('[data-prov-stripe]')!;
    expect(stripe.style.width).toBe('4px');
  });

  it('single-layer stripe has 8px margin-right', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'authoring', contributingLayers: ['authoring'] }}
        layerColors={colors}
        layerVisibility={allVisible}
      />,
    );
    const stripe = container.querySelector<HTMLElement>('[data-prov-stripe]')!;
    expect(stripe.style.marginRight).toBe('8px');
  });

  it('multi-layer container is 8px wide with 3px sub-stripes', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'content', contributingLayers: ['authoring', 'content'] }}
        layerColors={colors}
        layerVisibility={allVisible}
      />,
    );
    // Outer wrapper (no data-prov-stripe) should be 8px wide
    const wrapper = container.querySelector<HTMLElement>('span:not([data-prov-stripe])')!;
    expect(wrapper.style.width).toBe('8px');
    // Each sub-stripe should be 3px wide
    const stripes = container.querySelectorAll<HTMLElement>('[data-prov-stripe]');
    for (const s of Array.from(stripes)) {
      expect(s.style.width).toBe('3px');
    }
  });

  it('OOTB items render a single grey stripe', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'ootb', contributingLayers: ['ootb'] }}
        layerColors={colors}
        layerVisibility={allVisible}
      />,
    );
    const stripes = container.querySelectorAll<HTMLElement>('[data-prov-stripe]');
    expect(stripes.length).toBe(1);
    expect(stripes[0].style.backgroundColor).toBe('rgb(203, 213, 225)');
  });
});
