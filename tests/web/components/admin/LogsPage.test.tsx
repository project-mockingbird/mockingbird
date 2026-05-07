// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LogsPage } from '@/components/admin/LogsPage';
import { installFakeEventSource } from '../../_helpers/FakeEventSource';

beforeEach(() => {
  installFakeEventSource();
});

describe('LogsPage', () => {
  it('renders Server tab by default', () => {
    render(<LogsPage />);
    expect(screen.getByRole('tab', { name: /server/i, selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText(/level/i)).toBeInTheDocument();
  });

  it('switches to GraphQL tab', () => {
    render(<LogsPage />);
    fireEvent.click(screen.getByRole('tab', { name: /graphql/i }));
    expect(screen.getByRole('tab', { name: /graphql/i, selected: true })).toBeInTheDocument();
    expect(screen.queryByLabelText(/level/i)).toBeNull();
  });

  it('renders the home link', () => {
    render(<LogsPage />);
    const link = screen.getByRole('link', { name: /home/i });
    expect(link).toHaveAttribute('href', '/');
  });
});
