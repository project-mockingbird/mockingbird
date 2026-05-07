// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ServerLogTab } from '@/components/admin/ServerLogTab';
import { FakeEventSource, installFakeEventSource } from '../../_helpers/FakeEventSource';

beforeEach(() => {
  installFakeEventSource();
});

describe('ServerLogTab', () => {
  it('renders one row per replayed entry', () => {
    render(<ServerLogTab />);
    act(() => {
      FakeEventSource.last.emit('replay', [
        { id: 1, ts: 1, level: 'info', msg: 'request completed', method: 'POST', url: '/api/x', statusCode: 200, durationMs: 5, raw: '{}' },
        { id: 2, ts: 2, level: 'warn', msg: 'slow', method: 'GET', url: '/api/y', statusCode: 200, durationMs: 1500, raw: '{}' },
      ]);
    });
    expect(screen.getByText(/\/api\/x/)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/y/)).toBeInTheDocument();
  });

  it('filters by level dropdown', () => {
    render(<ServerLogTab />);
    act(() => {
      FakeEventSource.last.emit('replay', [
        { id: 1, ts: 1, level: 'info', msg: 'a', raw: '{}' },
        { id: 2, ts: 2, level: 'error', msg: 'b', raw: '{}' },
      ]);
    });
    fireEvent.change(screen.getByLabelText(/level/i), { target: { value: 'error' } });
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('filters by free-text substring across msg/url', () => {
    render(<ServerLogTab />);
    act(() => {
      FakeEventSource.last.emit('replay', [
        { id: 1, ts: 1, level: 'info', msg: 'hello', url: '/api/foo', raw: '{}' },
        { id: 2, ts: 2, level: 'info', msg: 'world', url: '/api/bar', raw: '{}' },
      ]);
    });
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'foo' } });
    expect(screen.getByText(/\/api\/foo/)).toBeInTheDocument();
    expect(screen.queryByText(/\/api\/bar/)).toBeNull();
  });
});
