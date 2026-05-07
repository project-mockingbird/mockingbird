// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../../../../src/web/components/layout/Header';

vi.mock('../../../../src/web/settings/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

describe('Header', () => {
  it('renders the Mockingbird tile + wordmark as a home anchor in an h-16 bar', () => {
    const { container } = render(
      <Header validationErrorCount={0} onValidationClick={() => {}} onCartToggle={() => {}} />
    );
    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink).toHaveAttribute('href', '/');
    const img = homeLink.querySelector('img');
    expect(img).toHaveAttribute('src', '/mockingbird-tile.svg');
    expect(homeLink).toHaveTextContent('Mockingbird');
    const headerEl = container.querySelector('header');
    expect(headerEl?.className).toMatch(/\bh-16\b/);
  });
});
