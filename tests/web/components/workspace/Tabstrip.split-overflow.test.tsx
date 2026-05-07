// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Tabstrip } from '@/components/workspace/Tabstrip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('Tabstrip overflow', () => {
  it('tablist has overflow-x-auto class to allow horizontal scroll', () => {
    const qc = new QueryClient();
    const tabs = Array.from({ length: 20 }).map((_, i) => ({
      tabId: `t-${i}`,
      selectedItemId: `item-${i}`,
      isActive: i === 0,
    }));
    render(
      <QueryClientProvider client={qc}>
        <Tabstrip tabs={tabs} paneIndex={0} onAdd={() => {}} />
      </QueryClientProvider>,
    );
    const list = screen.getByRole('tablist');
    expect(list.className).toMatch(/overflow-x-auto/);
  });
});
