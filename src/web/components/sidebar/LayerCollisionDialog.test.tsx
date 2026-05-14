// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { LayerCollisionDialog } from './LayerCollisionDialog';

describe('<LayerCollisionDialog>', () => {
  it('does not render when collidingProjectName is null', () => {
    render(
      <LayerCollisionDialog
        collidingProjectName={null}
        onSwitch={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows project name and Switch + Cancel when colliding', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    const onCancel = vi.fn();
    render(
      <LayerCollisionDialog
        collidingProjectName="existing-proj"
        onSwitch={onSwitch}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(/existing-proj/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /switch/i }));
    expect(onSwitch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
