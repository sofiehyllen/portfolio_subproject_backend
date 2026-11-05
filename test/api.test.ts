// Tests of the API over HTTP.

import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';

afterAll(() => pool.end());

describe('GET /api/titles (paged listing)', () => {
  it('returns the first page with the default page size', async () => {
    const res = await request(app).get('/api/titles');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 20, offset: 0 });
    expect(res.body.items.length).toBeLessThanOrEqual(20);
    expect(res.body.links.prev).toBeNull();
  });

  it('identifies every item by URI', async () => {
    const res = await request(app).get('/api/titles?limit=5');

    for (const item of res.body.items) {
      expect(item.url).toMatch(/^\/api\/titles\/tt\d+$/);
    }
  });

  it('gives a next link that leads to the following page', async () => {
    const first = await request(app).get('/api/titles?limit=5');
    const second = await request(app).get(first.body.links.next);

    expect(second.status).toBe(200);
    expect(second.body.offset).toBe(5);
    expect(second.body.links.prev).toBe('/api/titles?limit=5&offset=0');

    const firstUrls = first.body.items.map((item: { url: string }) => item.url);
    for (const item of second.body.items) {
      expect(firstUrls).not.toContain(item.url);
    }
  });

  it('applies the default when the page size exceeds the maximum', async () => {
    const res = await request(app).get('/api/titles?limit=1000');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(20);
  });
});

describe('GET /api/titles/{tconst}', () => {
  it('returns the title that the list links to, with genres, rating and credits', async () => {
    const list = await request(app).get('/api/titles?limit=1');
    const url: string = list.body.items[0].url;

    const res = await request(app).get(url);

    expect(res.status).toBe(200);
    expect(res.body.url).toBe(url);
    expect(Array.isArray(res.body.genres)).toBe(true);
    expect(Array.isArray(res.body.credits)).toBe(true);
    expect(res.body).toHaveProperty('rating');
    for (const credit of res.body.credits) {
      expect(credit.person.url).toMatch(/^\/api\/persons\/nm\d+$/);
    }
  });

  it('gives 404 for an unknown title', async () => {
    const res = await request(app).get('/api/titles/tt0000000');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Title not found' });
  });
});

describe('GET /api/titles/{tconst}/actors', () => {
  it('returns a page of actors, highest name rating first', async () => {
    const res = await request(app).get('/api/titles/tt0063929/actors?limit=3');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 3, offset: 0 });
    expect(res.body.items.length).toBeLessThanOrEqual(3);
    expect(res.body.items.length).toBeLessThanOrEqual(res.body.total);

    const ratings = res.body.items.map((actor: { nameRating: number | null }) => actor.nameRating ?? -1);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    for (const actor of res.body.items) {
      expect(actor.url).toMatch(/^\/api\/persons\/nm\d+$/);
    }
  });

  it('keeps the path in the paging links', async () => {
    const res = await request(app).get('/api/titles/tt0063929/actors?limit=1');

    expect(res.body.links.next).toBe('/api/titles/tt0063929/actors?limit=1&offset=1');
  });

  it('gives 404 for an unknown title', async () => {
    const res = await request(app).get('/api/titles/tt0000000/actors');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Title not found' });
  });
});