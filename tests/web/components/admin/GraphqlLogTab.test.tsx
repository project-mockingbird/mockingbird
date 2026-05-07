// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GraphqlLogTab } from '@/components/admin/GraphqlLogTab';
import { FakeEventSource, installFakeEventSource } from '../../_helpers/FakeEventSource';

beforeEach(() => {
  installFakeEventSource();
});

const sample = {
  id: 1, ts: 1, requestId: 'r1',
  operationName: 'GetItem', operationType: 'query',
  statusCode: 200, durationMs: 12,
  request: { query: 'query GetItem($id: ID!) { x }', variables: { id: '1' }, truncated: false },
  response: { body: '{"data":{"x":1}}', truncated: false },
  errorCount: 0, firstError: null,
};

describe('GraphqlLogTab', () => {
  it('renders rows collapsed by default', () => {
    render(<GraphqlLogTab />);
    act(() => { FakeEventSource.last.emit('replay', [sample]); });
    expect(screen.getByText('GetItem')).toBeInTheDocument();
    expect(screen.queryByText(/query GetItem/)).toBeNull();
  });

  it('expands a row to reveal request + response bodies', () => {
    render(<GraphqlLogTab />);
    act(() => { FakeEventSource.last.emit('replay', [sample]); });
    fireEvent.click(screen.getByRole('button', { name: /GetItem/ }));
    expect(screen.getByText(/query GetItem/)).toBeInTheDocument();
    expect(screen.getByText(/"data":/)).toBeInTheDocument();
  });

  it('renders "(anonymous)" when operationName is null', () => {
    render(<GraphqlLogTab />);
    act(() => { FakeEventSource.last.emit('replay', [{ ...sample, id: 2, operationName: null }]); });
    expect(screen.getByText('(anonymous)')).toBeInTheDocument();
  });

  it('shows error count when present', () => {
    render(<GraphqlLogTab />);
    act(() => { FakeEventSource.last.emit('replay', [{ ...sample, id: 3, errorCount: 2, firstError: 'boom' }]); });
    expect(screen.getByText(/2 error/)).toBeInTheDocument();
  });

  it('filters by free-text substring across operationName + query', () => {
    render(<GraphqlLogTab />);
    act(() => {
      FakeEventSource.last.emit('replay', [
        { ...sample, id: 4, operationName: 'Alpha' },
        { ...sample, id: 5, operationName: 'Beta' },
      ]);
    });
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Alpha' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).toBeNull();
  });
});
