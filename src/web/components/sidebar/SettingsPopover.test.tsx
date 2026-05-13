// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingsPopover } from './SettingsPopover';

describe('SettingsPopover', () => {
  it('reads autoRestoreLastSession checked state', () => {
    render(<SettingsPopover autoRestoreLastSession={true} onChange={() => {}} />);
    const checkbox = screen.getByLabelText(/auto-restore last session/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('fires onChange with the new value when toggled on', () => {
    const onChange = vi.fn();
    render(<SettingsPopover autoRestoreLastSession={false} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/auto-restore last session/i));
    expect(onChange).toHaveBeenCalledWith({ autoRestoreLastSession: true });
  });

  it('fires onChange with the new value when toggled off', () => {
    const onChange = vi.fn();
    render(<SettingsPopover autoRestoreLastSession={true} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/auto-restore last session/i));
    expect(onChange).toHaveBeenCalledWith({ autoRestoreLastSession: false });
  });
});
