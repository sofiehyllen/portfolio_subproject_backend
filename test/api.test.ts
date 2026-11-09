// Tests of the API over HTTP.

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
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

  it('gives every item its rating, the same as on the title itself', async () => {
    const res = await request(app).get('/api/titles?limit=20');

    for (const item of res.body.items) {
      expect(item).toHaveProperty('rating');
      if (item.rating !== null) {
        expect(item.rating).toEqual({
          average: expect.any(Number),
          votes: expect.any(Number),
        });
      }

      const detail = await request(app).get(item.url);
      expect(item.rating).toEqual(detail.body.rating);
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

describe('GET /api/titles/{tconst}/similar', () => {
  it('returns a page of movies, most shared genres first', async () => {
    const res = await request(app).get('/api/titles/tt0111596/similar?limit=5');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 5, offset: 0 });
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.length).toBeLessThanOrEqual(5);

    const scores = res.body.items.map((movie: { similarityScore: number }) => movie.similarityScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const movie of res.body.items) {
      expect(movie.url).toMatch(/^\/api\/titles\/tt\d+$/);
      expect(movie.commonGenres).toHaveLength(movie.similarityScore);
    }
  });

  it('keeps the path in the paging links', async () => {
    const res = await request(app).get('/api/titles/tt0111596/similar?limit=1');

    expect(res.body.links.next).toBe('/api/titles/tt0111596/similar?limit=1&offset=1');
  });

  it('gives an empty list for a title that is not a movie', async () => {
    const res = await request(app).get('/api/titles/tt0063929/similar');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('gives 404 for an unknown title', async () => {
    const res = await request(app).get('/api/titles/tt0000000/similar');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Title not found' });
  });
});

describe('PUT /api/users/{uid}/password', () => {
  let userId: number;

  beforeAll(async () => {
    const suffix = Date.now();
    const result = await pool.query(`
      SELECT create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', `user_${suffix}`, `user_${suffix}@test.com`, 'password']);
    userId = result.rows[0].uconst; 
  });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userId]);
  });

  it('returns 204 for a valid password update', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}/password`)
      .send({currentPassword: 'password', newPassword: 'newPassword'});
    
    expect(res.status).toBe(204);
  });

  it('returns 404 for an unknown user', async () => {
    const res = await request(app)
      .put(`/api/users/999999999/password`)
      .send({currentPassword: 'password', newPassword: 'newPassword'});
    
    expect(res.status).toBe(404);
  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}/password`)
      .send({currentPassword: 'password'});
    
      expect(res.status).toBe(400);
  });

  it('returns 400 when currentPassword is missing', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}/password`)
      .send({newPassword: 'password'});

    expect(res.status).toBe(400);

  });

  it('returns 400 when currentPassword is not a string', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}/password`)
      .send({currentPassword: 123});
    
    expect(res.status).toBe(400);

  });

  it('returns 400 when newPassword is not a string', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}/password`)
      .send({newPassword: 123});

    expect(res.status).toBe(400);
  });
  
  it('returns 400 when currentPassword is undefined', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}/password`)
      .send({currentPassword: undefined});
      
    expect(res.status).toBe(400);
  });
});

describe('GET /api/related-words', () => {
  it('returns the most associated words, most frequent first, without the given words', async () => {
    const res = await request(app).get('/api/related-words?words=space,war');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.total).toBe(res.body.items.length);

    const counts = res.body.items.map((item: { count: number }) => item.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    const found = res.body.items.map((item: { word: string }) => item.word);
    expect(found).not.toContain('space');
    expect(found).not.toContain('war');
  });

  it('pages the list and keeps the words in the paging links', async () => {
    const res = await request(app).get('/api/related-words?words=space&limit=3');

    expect(res.body.items).toHaveLength(3);
    expect(res.body.total).toBe(10);

    const next = new URL(res.body.links.next, 'http://localhost');
    expect(next.pathname).toBe('/api/related-words');
    expect(next.searchParams.get('words')).toBe('space');
    expect(next.searchParams.get('offset')).toBe('3');

    const second = await request(app).get(res.body.links.next);
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(3);
  });

  it('gives an empty list when no title has the word', async () => {
    const res = await request(app).get('/api/related-words?words=zzzznotaword');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, items: [] });
  });

  it.each([
    ['missing', '/api/related-words'],
    ['blank', '/api/related-words?words=,%20,'],
    ['sent twice', '/api/related-words?words=a&words=b'],
    ['too many words', '/api/related-words?words=a,b,c,d,e,f,g,h,i,j,k'],
    ['a word that is too long', `/api/related-words?words=${'a'.repeat(51)}`],
  ])('gives 400 when words is %s', async (_case, url) => {
    const res = await request(app).get(url);

    expect(res.status).toBe(400);
  });
});
