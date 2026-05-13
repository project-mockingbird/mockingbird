// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetLayerState } from '@/state/layerState';
import { ProjectSidebar } from './ProjectSidebar';

describe('ProjectSidebar -> Switch/Close handlers (smoke)', () => {
  beforeEach(() => resetLayerState());

  it('Close button invokes onClose handler', () => {
    const onClose = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ProjectSidebar
          status={{
            state: 'ready',
            layers: [
              { name: 'a', sitecoreJsonPath: '/w/a/sitecore.json', color: '#22c55e', effectiveCount: 1 },
              { name: 'ootb', effectiveCount: 1 },
            ],
          }}
          onSwitch={() => {}}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /project actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /close project/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Switch button invokes onSwitch handler', () => {
    const onSwitch = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ProjectSidebar
          status={{
            state: 'ready',
            layers: [
              { name: 'a', sitecoreJsonPath: '/w/a/sitecore.json', color: '#22c55e', effectiveCount: 1 },
              { name: 'ootb', effectiveCount: 1 },
            ],
          }}
          onSwitch={onSwitch}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /project actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /open another project/i }));
    expect(onSwitch).toHaveBeenCalled();
  });
});
