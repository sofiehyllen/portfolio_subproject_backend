// Tests of the data access layer, run against the database from .env.
//
// The titles tests only read IMDB data, which the API never changes.
// The framework tests write users and ratings. Each of them runs
// inside a transaction that is rolled back afterwards, so nothing they write
// is left behind and repeated runs give the same result.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { PoolClient } from 'pg';
import * as titles from '../src/data/titles.js';
import * as users from '../src/data/users.js';
import * as ratings from '../src/data/ratings.js';
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

// ---------------------------------------------------------------------------
// Framework data: every test runs inside a transaction that is rolled back
// afterwards, so the second run gives the same result as the first.
//
// The tests call the functions that take a client (rateOn, findOn,
// lockActiveRatingOn, lockOn, updateOn), so every write is made on the
// transaction's client. Rows written in the transaction are read back on the
// same client too: a read through the pool would not see them.

describe('framework data, in a transaction that is rolled back', () => {
  const TCONST = 'tt0063929';
  let client: PoolClient;
  let uconst: number;
  let votesAtStart: number;

  // The title's vote count, read on the transaction's client.
  async function votes(): Promise<number> {
    const { rows } = await client.query<{ num_votes: number }>(
      'SELECT num_votes FROM ratings WHERE tconst = $1', [TCONST]);
    return rows[0]?.num_votes ?? 0;
  }

  beforeAll(async () => {
    client = await pool.connect();
    votesAtStart = await votes();
  });

  beforeEach(async () => {
    await client.query('BEGIN');
    // A fixed username: if a rollback failed, the next run would fail on UNIQUE.
    const { rows } = await client.query<{ uconst: number }>(
      `SELECT create_user('Test', 'User', 'data_test_user',
                          'data_test_user@example.com', 'not-a-real-hash') AS uconst`);
    uconst = rows[0].uconst;
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  afterAll(() => client.release());

  describe('ratings', { timeout: 30_000 }, () => {
    it('stores a first rating and adds one vote to the title', async () => {
      expect(await ratings.lockActiveRatingOn(client, uconst, TCONST)).toBe(false);

      await ratings.rateOn(client, uconst, TCONST, 10);

      expect(await ratings.findOn(client, uconst, TCONST)).toMatchObject({
        uconst, tconst: TCONST, rating: 10, deletedAt: null,
      });
      expect(await votes()).toBe(votesAtStart + 1);
    });

    // The same call again gives the same answer: the first test was rolled back.
    it('starts from the same vote count every time', async () => {
      await ratings.rateOn(client, uconst, TCONST, 10);
      expect(await votes()).toBe(votesAtStart + 1);
    });

    it('replaces the vote, without adding one, when the user changes the rating', async () => {
      await ratings.rateOn(client, uconst, TCONST, 10);
      await ratings.rateOn(client, uconst, TCONST, 2);

      expect(await ratings.lockActiveRatingOn(client, uconst, TCONST)).toBe(true);
      expect(await ratings.findOn(client, uconst, TCONST)).toMatchObject({ rating: 2 });
      expect(await votes()).toBe(votesAtStart + 1);
    });
  });

  describe('users', () => {
    it('updates the given profile fields and never the username', async () => {
      expect(await users.lockOn(client, uconst)).toBe(true);

      await users.updateOn(client, uconst, { firstName: 'Changed', email: 'changed@example.com' });

      const { rows } = await client.query(
        'SELECT first_name, last_name, username, email FROM users WHERE uconst = $1', [uconst]);
      expect(rows[0]).toEqual({
        first_name: 'Changed',
        last_name: 'User',
        username: 'data_test_user',
        email: 'changed@example.com',
      });
    });

    it('finds no user to lock for an unknown id', async () => {
      expect(await users.lockOn(client, -1)).toBe(false);
    });
  });
});