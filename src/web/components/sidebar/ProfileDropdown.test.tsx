// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProfileDropdown } from './ProfileDropdown';

const BASE = [
  { name: 'dev', projectName: 'demo', layerCount: 2, updatedAt: 'T0' },
  { name: 'qa', projectName: 'demo', layerCount: 3, updatedAt: 'T1' },
];

describe('ProfileDropdown', () => {
  it('renders the active profile name', () => {
    render(
      <ProfileDropdown
        activeName="dev"
        profiles={BASE}
        onSave={() => {}}
        onSaveAs={() => {}}
        onSwitch={() => {}}
        onManage={() => {}}
      />,
    );
    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('renders "Unsaved" when activeName is null', () => {
    render(
      <ProfileDropdown
        activeName={null}
        profiles={[]}
        onSave={() => {}}
        onSaveAs={() => {}}
        onSwitch={() => {}}
        onManage={() => {}}
      />,
    );
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
  });

  it('fires onSwitch when a different profile is picked', () => {
    const onSwitch = vi.fn();
    render(
      <ProfileDropdown
        activeName="dev"
        profiles={BASE}
        onSave={() => {}}
        onSaveAs={() => {}}
        onSwitch={onSwitch}
        onManage={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    fireEvent.click(screen.getByText('qa'));
    expect(onSwitch).toHaveBeenCalledWith('qa');
  });

  it('does not fire onSwitch when active profile is picked again', () => {
    const onSwitch = vi.fn();
    render(
      <ProfileDropdown
        activeName="dev"
        profiles={BASE}
        onSave={() => {}}
        onSaveAs={() => {}}
        onSwitch={onSwitch}
        onManage={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    fireEvent.click(screen.getByText('dev'));
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('fires onSaveAs from the menu', () => {
    const onSaveAs = vi.fn();
    render(
      <ProfileDropdown
        activeName="dev"
        profiles={BASE}
        onSave={() => {}}
        onSaveAs={onSaveAs}
        onSwitch={() => {}}
        onManage={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    fireEvent.click(screen.getByText(/save as/i));
    expect(onSaveAs).toHaveBeenCalled();
  });

  it('disables Save when there is no active profile', () => {
    render(
      <ProfileDropdown
        activeName={null}
        profiles={[]}
        onSave={() => {}}
        onSaveAs={() => {}}
        onSwitch={() => {}}
        onManage={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    const saveBtn = screen.getByText(/^save$/i).closest('button');
    expect(saveBtn).toBeDisabled();
  });

  it('fires onManage from the menu', () => {
    const onManage = vi.fn();
    render(
      <ProfileDropdown
        activeName="dev"
        profiles={BASE}
        onSave={() => {}}
        onSaveAs={() => {}}
        onSwitch={() => {}}
        onManage={onManage}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    fireEvent.click(screen.getByText(/manage profiles/i));
    expect(onManage).toHaveBeenCalled();
  });
});
