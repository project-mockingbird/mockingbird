// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ProjectSidebar } from './ProjectSidebar';
import { resetLayerState } from '@/state/layerState';

const statusReady = {
  state: 'ready' as const,
  layers: [
    { name: 'authoring', sitecoreJsonPath: '/workspaces/p/authoring/sitecore.json', color: '#22c55e', effectiveCount: 340 },
    { name: 'content', sitecoreJsonPath: '/workspaces/p/content/sitecore.json', color: '#3b82f6', effectiveCount: 1234 },
    { name: 'ootb', effectiveCount: 22613 },
  ],
  registryItemCount: 22613,
};

const statusNoProject = { state: 'no-project' as const, layers: [], registryItemCount: 22613 };

beforeEach(() => resetLayerState());

describe('<ProjectSidebar>', () => {
  it('renders nothing when state is no-project', () => {
    const { container } = render(
      <ProjectSidebar status={statusNoProject} onSwitch={() => {}} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per user layer + an OOTB substrate row', () => {
    render(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    expect(screen.getByText('authoring')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByText(/OOTB/)).toBeInTheDocument();
    expect(screen.getByText('22613')).toBeInTheDocument();
  });

  it('Switch button calls onSwitch', async () => {
    const onSwitch = vi.fn();
    const user = userEvent.setup();
    render(<ProjectSidebar status={statusReady} onSwitch={onSwitch} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /switch/i }));
    expect(onSwitch).toHaveBeenCalled();
  });

  it('Close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
