// Unit tests for the paging logic.

import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { pageOf, paged } from '../src/routes/pagination.js';

// A minimal stand-in for an Express request. paged() only reads query, baseUrl and path.
function fakeRequest(query: Record<string, string> = {}): Request {
  return { query, baseUrl: '/api/titles', path: '/' } as unknown as Request;
}

describe('pageOf', () => {
  it('uses the defaults when no paging is given', () => {
    expect(pageOf({})).toEqual({ limit: 20, offset: 0 });
  });

  it('accepts a valid limit and offset', () => {
    expect(pageOf({ limit: '10', offset: '30' })).toEqual({ limit: 10, offset: 30 });
  });

  it('falls back to the default when the page size exceeds the maximum', () => {
    expect(pageOf({ limit: '101' }).limit).toBe(20);
  });

  it.each(['0', '-1', 'abc', '2.5', ''])('falls back to the default for limit=%s', (limit) => {
    expect(pageOf({ limit }).limit).toBe(20);
  });

  it.each(['-1', 'abc', '1.5'])('falls back to 0 for offset=%s', (offset) => {
    expect(pageOf({ offset }).offset).toBe(0);
  });
});

describe('paged', () => {
  const total = 45;

  it('has no prev link on the first page', () => {
    const result = paged(fakeRequest(), { limit: 20, offset: 0 }, total, []);
    expect(result.links.prev).toBeNull();
    expect(result.links.next).toBe('/api/titles?limit=20&offset=20');
  });

  it('links to both neighbours on a middle page', () => {
    const result = paged(fakeRequest(), { limit: 20, offset: 20 }, total, []);
    expect(result.links.prev).toBe('/api/titles?limit=20&offset=0');
    expect(result.links.next).toBe('/api/titles?limit=20&offset=40');
  });

  it('has no next link on the last page', () => {
    const result = paged(fakeRequest(), { limit: 20, offset: 40 }, total, []);
    expect(result.links.next).toBeNull();
  });
});