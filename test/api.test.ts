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