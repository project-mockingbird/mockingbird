/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProvenanceBar } from './ProvenanceBar';

describe('<ProvenanceBar>', () => {
  const colors = { authoring: '#22c55e', content: '#3b82f6', ootb: '#9ca3af' };
  const allVisible = { authoring: true, content: true, ootb: true };

  it('renders one 4px stripe per contributing layer', () => {
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

  it('renders empty (zero stripes) when all contributors are off', () => {
    const { container } = render(
      <ProvenanceBar
        provenance={{ winnerLayer: 'content', contributingLayers: ['authoring', 'content'] }}
        layerColors={colors}
        layerVisibility={{ authoring: false, content: false, ootb: true }}
      />,
    );
    expect(container.querySelectorAll('[data-prov-stripe]').length).toBe(0);
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
    expect(stripes[0].style.backgroundColor).toBe('rgb(156, 163, 175)');
  });
});
