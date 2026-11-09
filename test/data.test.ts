// Tests of the data access layer for titles run against the database from .env.
// IMDB data is read-only, so the tests give the same result on every run without a rollback.

import { describe, it, expect, afterAll } from 'vitest';
import * as titles from '../src/data/titles.js';
import { pool } from '../src/db.js';

afterAll(() => pool.end());

const BY_TITLE: titles.TitleBrowse = { sort: 'title', order: 'asc' };

describe('titles.list', () => {
  it('returns at most limit rows', async () => {
    const rows = await titles.list(BY_TITLE, 5, 0);
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it('gives consecutive pages that neither overlap nor skip rows', async () => {
    const first = await titles.list(BY_TITLE, 5, 0);
    const second = await titles.list(BY_TITLE, 5, 5);
    const both = await titles.list(BY_TITLE, 10, 0);
    expect([...first, ...second].map((t) => t.tconst)).toEqual(both.map((t) => t.tconst));
  });

  it('returns an empty page past the end of the list', async () => {
    const total = await titles.count();
    expect(await titles.list(BY_TITLE, 5, total)).toEqual([]);
  });

  it('sorts by rating, highest first, with unrated titles last', async () => {
    const rated = await titles.list({ sort: 'rating', order: 'desc' }, 20, 0);
    const averages = rated.map((t) => t.rating!.average);
    expect(averages).toEqual([...averages].sort((a, b) => b - a));

    const total = await titles.count();
    const last = await titles.list({ sort: 'rating', order: 'desc' }, 1, total - 1);
    expect(last[0].rating).toBeNull();
  });

  it('keeps pages stable when many titles share the sort value', async () => {
    const browse: titles.TitleBrowse = { sort: 'year', order: 'desc' };
    const first = await titles.list(browse, 5, 0);
    const second = await titles.list(browse, 5, 5);
    const both = await titles.list(browse, 10, 0);
    expect([...first, ...second].map((t) => t.tconst)).toEqual(both.map((t) => t.tconst));
  });

  it('filters by genre and title type, ignoring case, and counts the same titles', async () => {
    const filter = { genre: 'drama', titleType: 'MOVIE' };
    const rows = await titles.list({ ...filter, sort: 'title', order: 'asc' }, 100, 0);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.titleType).toBe('movie');

    const total = await titles.count(filter);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(await titles.count({ titleType: 'movie' }));
  });

  it('gives no titles for an unknown genre', async () => {
    expect(await titles.count({ genre: 'no-such-genre' })).toBe(0);
  });
});