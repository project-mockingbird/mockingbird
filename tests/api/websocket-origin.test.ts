import { describe, it, expect } from 'vitest';
import { isOriginAllowed } from '../../src/api/websocket.js';

describe('isOriginAllowed', () => {
  it('allows missing origin (non-browser client)', () => {
    expect(isOriginAllowed(undefined, 'localhost:3333', [])).toBe(true);
  });

  it('allows same-origin upgrade', () => {
    expect(isOriginAllowed('http://localhost:3333', 'localhost:3333', [])).toBe(true);
    expect(isOriginAllowed('https://localhost:3333', 'localhost:3333', [])).toBe(true);
  });

  it('rejects cross-origin upgrade by default', () => {
    expect(isOriginAllowed('http://evil.example.com', 'localhost:3333', [])).toBe(false);
    expect(isOriginAllowed('http://localhost:8080', 'localhost:3333', [])).toBe(false);
  });

  it('allows an origin present in the env allowlist', () => {
    expect(
      isOriginAllowed('http://app.local', 'localhost:3333', ['http://app.local']),
    ).toBe(true);
  });

  it('rejects when host is missing and origin is present', () => {
    expect(isOriginAllowed('http://localhost:3333', undefined, [])).toBe(false);
  });

  it('rejects an unparseable origin string', () => {
    expect(isOriginAllowed('not a url', 'localhost:3333', [])).toBe(false);
  });
});
