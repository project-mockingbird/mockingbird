// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { LaunchPage } from '../../../src/web/components/LaunchPage';

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('LaunchPage', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('renders the hero tile + Mockingbird wordmark', () => {
    render(<LaunchPage />, { wrapper: makeWrapper(qc) });
    expect(screen.getByText(/Mockingbird/)).toBeInTheDocument();
    const heroImg = document.querySelector('img[src="/mockingbird-tile.svg"]');
    expect(heroImg).toBeInTheDocument();
  });

  it('renders a Content Tree tile linking to /tree', () => {
    render(<LaunchPage />, { wrapper: makeWrapper(qc) });
    const link = screen.getByRole('link', { name: /content tree/i });
    expect(link).toHaveAttribute('href', '/tree');
    expect(link).not.toHaveAttribute('target');
  });

  it('renders a GraphQL Editor tile linking to /graphiql in a new tab', () => {
    render(<LaunchPage />, { wrapper: makeWrapper(qc) });
    const link = screen.getByRole('link', { name: /graphql editor/i });
    expect(link).toHaveAttribute('href', '/graphiql');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener') as unknown as string);
  });

  it('renders a PowerShell ISE tile linking to /scripts', () => {
    render(<LaunchPage />, { wrapper: makeWrapper(qc) });
    const link = screen.getByRole('link', { name: /powershell ise/i });
    expect(link).toHaveAttribute('href', '/scripts');
  });
});
