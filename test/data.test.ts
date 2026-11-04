// Tests of the data access layer for titles run against the database from .env.
// IMDB data is read-only, so the tests give the same result on every run without a rollback.

import { describe, it, expect, afterAll } from 'vitest';
import * as titles from '../src/data/titles.js';
import { pool } from '../src/db.js';

afterAll(() => pool.end());

describe('titles.list', () => {
  it('returns at most limit rows', async () => {
    const rows = await titles.list(5, 0);
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it('gives consecutive pages that neither overlap nor skip rows', async () => {
    const first = await titles.list(5, 0);
    const second = await titles.list(5, 5);
    const both = await titles.list(10, 0);
    expect([...first, ...second].map((t) => t.tconst)).toEqual(both.map((t) => t.tconst));
  });

  it('returns an empty page past the end of the list', async () => {
    const total = await titles.count();
    expect(await titles.list(5, total)).toEqual([]);
  });
});