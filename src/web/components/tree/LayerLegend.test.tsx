/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LayerLegend } from './LayerLegend';

describe('<LayerLegend>', () => {
  const layers = [
    { name: 'authoring', color: '#22c55e' },
    { name: 'content', color: '#3b82f6' },
  ];

  it('renders one pill per layer plus the ootb pill', () => {
    render(<LayerLegend layers={layers} layerVisibility={{}} />);
    expect(screen.getByText('authoring')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByText(/OOTB/i)).toBeInTheDocument();
  });

  it('hidden layers render with reduced opacity', () => {
    const { container } = render(
      <LayerLegend layers={layers} layerVisibility={{ authoring: false }} />,
    );
    const pills = container.querySelectorAll<HTMLElement>('[data-legend-pill]');
    const authoringPill = Array.from(pills).find((p) => p.dataset.layerName === 'authoring');
    expect(authoringPill?.className).toMatch(/opacity-/);
  });

  it('renders nothing when there are no user layers', () => {
    const { container } = render(<LayerLegend layers={[]} layerVisibility={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
