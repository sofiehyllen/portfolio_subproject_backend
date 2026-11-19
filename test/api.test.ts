// Tests of the API over HTTP.
// Sorted by route file: persons.ts, titles.ts, users.ts, words.ts

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';
import { hashPassword, verifyToken, TOKEN_TTL_SECONDS } from '../src/auth/crypto.js';
import { TOKEN_COOKIE } from '../src/middleware/auth.js';
import { url } from 'node:inspector';

afterAll(() => pool.end());

// ═════════════════════════════════════════════════════════════════════════════
// AUTH.TS
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Get JWT authentication cookie string from a `Set-Cookie` response header
 * @param res the HTTP response containing `Set-Cookie` headers
 * @returns the matching cookie entry starting with `TOKEN_COOKIE` or an empty string
 */
function jwtCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find(i => i.startsWith(`${TOKEN_COOKIE}=`)) ?? '';

  return cookie
}


describe('POST /api/auth/token', () => {
  let username: string;
  let userId: number;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword('password');
    username = 'test_user';
    const result = await pool.query(`
      SELECT create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', username, `${username}@test.com`, passwordHash]);

    userId = result.rows[0].uconst;
  });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userId]);
  });

  it('Returns 200 with the user URI, no token in body', async () => {
    const res = await request(app).post('/api/auth/token')
                            .send({ username, password: 'password' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: `/api/users/${userId}` });
  }); 

  it('Sets up an Http jwt cookie valid for 12 hours', async () => {
    const res = await request(app).post('/api/auth/token')
                                  .send({ username, password: 'password' });
    
    const cookie = jwtCookie(res);
    const token = cookie.split(';', 1)[0].slice(`${TOKEN_COOKIE}=`.length);

    expect(verifyToken(token)).toMatchObject({ uconst: userId });
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toContain(`Max-Age=${TOKEN_TTL_SECONDS}`);
  });

  it('Returns 400 when username is missing', async () => {
    const res = await request(app).post('/api/auth/token')
                                  .send( { password: 'password'} );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request'});
  });

  it('Returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/auth/token')
                                  .send( { username } );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request'});
  });

  it('Returns 400 when username is not a string', async () => {
    const res = await request(app).post('/api/auth/token')
                                  .send( { username: 123} );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request'});
  });

  it('Returns 400 when password is not a string', async () => {
    const res = await request(app).post('/api/auth/token')
                                  .send( { password: 123} );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request'});
  });

  it('Returns 401 when password is not valid', async () => {
    const res = await request(app).post('/api/auth/token')
                                  .send( { username, password: 'wrong_password'} );
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized'});
  });

  it('Returns 401 when user does not exist', async () => {
    const res = await request(app).post('/api/auth/token')
                                  .send( { username: 'wrong_user', password: 'password'} );
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized'});
  });
});

describe('DELETE /api/auth/token', () => {
  let username: string;
  let userId: number;
  let passwordHash: string;
  
  beforeAll(async () => {
    passwordHash = await hashPassword('password');
    username = 'test_user';
    const result = await pool.query(`
      SELECT create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', username, `${username}@test.com`, passwordHash]);

    userId = result.rows[0].uconst;
  });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userId]);
  });

  it('Returns 204 and clears the cookies', async () => {
    const res = await request(app).delete('/api/auth/token');

    expect(res.status).toBe(204);
    const cookie = jwtCookie(res);
    expect(cookie).toMatch(new RegExp(`^${TOKEN_COOKIE}=;`));
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  });

  it('Returns 204 when not logged in', async () => {
    const res = await request(app).delete('/api/auth/token');

    expect(res.status).toBe(204);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PERSONS.TS
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/persons (name filter)', () => {
  it('Returns only persons matching the name', async () => {
    const res = await request(app).get('/api/persons?name=blanchett');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.primaryName.toLowerCase()).toContain('blanchett');
    }

  });

  it('Returns 400 for an blank name', async () => {
    const res = await request(app).get('/api/persons?name=');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request' });
  });

  it('Returns 400 for an nonexistent name', async () => {
    const res = await request(app).get('/api/persons?name=123456abcde');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ "total": 0, "items": []});
  });

  it('Returns 400 for a name longer than 100 characters', async () => {
    const res = await request(app).get('/api/persons?name=abcdefhgabcdefhgabcdefhgabcdefhgabcdefhgabcdefhgabcdefhgabcdefhgabcdefhgabcdefhgabcdefhgabcdefhgabcde');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request' });
  });

  it('Returns actors with ActorsOnly=true with no name', async () => {
    const res = await request(app).get('/api/persons?actorsOnly=true')
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request', message:"actorsOnly requires name" });
  });


  it('Returns actors with ActorsOnly=true with name', async () => {
    const res = await request(app).get('/api/persons?actorsOnly=true&name=blanchett')
    const allProfessions= await request(app).get('/api/persons?name=blanchett')
    
    expect(res.status).toBe(200);
    expect(res.body.total).not.toEqual(allProfessions.body.total);

    for (const item of res.body.items) {
      expect(item.professions.find((i: string) => i === 'actor' || i === 'actress')).toBeDefined();
    }

  });

}); 

describe('GET /api/persons (paged listing)', () => {
  it('returns 200 with a paged response', async () => {
    const res = await request(app).get('/api/persons');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 20, offset: 0 });
    expect(res.body.items.length).toBeLessThanOrEqual(20);
    expect(res.body.links.prev).toBeNull();
  });

  it('returns items in the person DTO shape', async () => {
    const res = await request(app).get('/api/persons');
    expect(res.body.items).toHaveLength(20);
    
    res.body.items
      .forEach((element: any) => {
        expect(element).toHaveProperty('url');
        expect(typeof element.url).toBe('string');

        expect(element).toHaveProperty('primaryName');
        expect(typeof element.primaryName).toBe('string');

        expect(element).toHaveProperty('birthYear');
        expect(element.birthYear === null || typeof element.birthYear === 'number');

        expect(element).toHaveProperty('deathYear');
        expect(element.deathYear === null || typeof element.deathYear === 'number');

        expect(element).toHaveProperty('avgNameRating');
        expect(element.avgNameRating === null || typeof element.avgNameRating === 'number');

        expect(element).toHaveProperty('professions');
        expect(Array.isArray(element.professions)).toBe(true);
      });
  });

  it('respects limits and offsets', async () => {
    const res = await request(app).get('/api/persons?limit=10&offset=500');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 10, offset: 500 });
    expect(res.body.items.length).toBeLessThanOrEqual(20);
    expect(res.body.links.prev).toBe("/api/persons?limit=10&offset=490");
    expect(res.body.links.next).toBe("/api/persons?limit=10&offset=510");
  });

  it('returns empty list but correct total past last page', async () => {
    const first = await request(app).get('/api/persons?limit=1');
    const total = first.body.total;

    const res = await request(app).get(`/api/persons?offset=${total}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 536498, offset: total, limit: 20 });
    expect(res.body.items.length).toBeLessThanOrEqual(0);
    expect(res.body.links.prev).toBe(`/api/persons?offset=${total - 20}&limit=20`);
    expect(res.body.links.next).toBeNull();
  }, 30000);

  it('caps limit over 20', async () => {
    const res = await request(app).get('/api/persons?limit=1000000');
  
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({limit: 20 });

  });
});

describe('GET /api/persons/ (sorting)', () => {
  it('sort by rating', async () => {
    const resAsc = await request(app).get('/api/persons?sort=rating&order=asc');
    const resDesc = await request(app).get('/api/persons?sort=rating&order=desc');

    expect(resAsc.status).toBe(200);
    expect(resDesc.status).toBe(200);

    expect(resAsc).not.toMatchObject(resDesc);
  });

  it('combine sorting with name filter', async () => {
    const res = await request(app).get('/api/persons?name=blanchett&sort=rating&order=desc');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('keeps sorting and filters in the paging links', async () => {
    const res = await request(app).get('/api/persons?name=blanchett&sort=rating&order=desc&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.links.next).toContain('sort=rating');
    expect(res.body.links.next).toContain('order=desc');
    expect(res.body.links.next).toContain('name=blanchett');
    
  });

  it('Returns 400 for an uknown sort field', async () => {
    const res = await request(app).get('/api/persons?wrongField=abc');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Bad Request", message: "unknown query parameter 'wrongField'" });
  });

  it('Returns 400 for an uknown sorting direction', async () => {
    const res = await request(app).get('/api/persons?sort=rating&order=up');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Bad Request", message:"order must be one of asc, desc" });
  });
});

describe('GET /api/persons/{nconst}', () => {
  it('Returns the person', async () => {
    const res = await request(app).get('/api/persons/nm0000949');
    
    expect(res.status).toBe(200);
    const expectedKeys = ['url', 'primaryName', 'birthYear', 'deathYear', 'avgNameRating', 'professions', 'roles', 'knownFor'];
    expect(Object.keys(res.body).sort()).toEqual(expectedKeys.sort());

  });

  it('Returns 404 for an uknown person', async () => {
    const res = await request(app).get('/api/persons/nm0000000');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Not Found", message: "Person not found"  });
  });

  it('Returns 400 for wrong nconst', async () => {
    const res = await request(app).get('/api/persons/mm0000949');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Bad Request", message: "nconst must be a string starting with nm and have at least 7 digits"  });
  });
});

describe('GET /api/persons/{nconst}/titles', () => {
  it('returns only matching titles for a valid search', async () => {
    const res = await request(app).get('/api/persons/nm0000054/titles');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      "total": 2,
      "limit": 20,
      "offset": 0,
      "items": [
        {
          "url": "/api/titles/tt13734340",
          "person": "/api/persons/nm0000054",
          "primaryTitle": "Marilyn Monroe: Photobiography",
          "category": "archive_footage",
          "job": null,
          "characters": ["Self"]
        },
        {
          "url": "/api/titles/tt3483980",
          "person": "/api/persons/nm0000054",
          "primaryTitle": "From Gold to Containers, from Salt to Empires",
          "category": "archive_footage",
          "job": null,
          "characters": ["Self"]
        }
      ],
      "links": {
        "prev": null,
        "next": null
      }
    });
  });

  it('returns 404 when person is not found', async () => {
    const res = await request(app).get('/api/persons/nm9999999/titles');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      "status": 404,
      "error": "Not Found",
      "message": "Person not found"});
  });

  it('returns 400 for an invalid search paramenter', async () => {
    const res = await request(app).get('/api/persons/tm9999999/titles');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      "status": 400,
      "error": "Bad Request",
      "message": "nconst must be a string starting with nm and have at least 7 digits"});
  });
});

describe('GET /api/persons/{nconst}/titles (ordering', () => {
  it('Keeps the path in the paging links', async () => {
    const res = await request(app).get('/api/persons/nm0000949/titles?limit=1&offset=1');

    expect(res.status).toBe(200);
    expect(res.body.links.prev).toContain("/api/persons/nm0000949/titles?limit=1&offset=0");
    expect(res.body.links.next).toContain("/api/persons/nm0000949/titles?limit=1&offset=2");

  });
});

describe('GET /:nconst/co-players', () => {
  it('returns only matching co-players for a valid search', async () => {
    const res = await request(app).get('/api/persons/nm0000949/co-players?limit=1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      "total": 51,
      "limit": 1,
      "offset": 0,
      "items": [
        {
          "url": "/api/persons/nm0101710",
          "primaryName": "Billy Boyd",
          "frequency": 2
        }
      ],
      "links": {
        "prev": null,
        "next": "/api/persons/nm0000949/co-players?limit=1&offset=1"
      }});
  }, 30000);

  it('returns 404 when person is not found', async () => {
    const res = await request(app).get('/api/persons/nm9999999/co-players');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      "status":404,
      "error":"Not Found",
      "message":"Person not found"});

  });

  it('returns 400 for an invalid search paramenter', async () => {
    const res = await request(app).get('/api/persons/tm9999999/co-players');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      "status":400,
      "error":"Bad Request",
      "message":"nconst must be a string starting with nm and have at least 7 digits"});
  });
});

describe('GET /api/persons/{nconst}/words', () => {
  it('returns a page of associated words, most frequent first', async () => {
    const res = await request(app).get('/api/persons/nm0000949/words?limit=5');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 5, offset: 0 });
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    expect(res.body.links.prev).toBeNull();

    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(['frequency', 'word']);
    }

    const frequencies = res.body.items.map((item: { frequency: number }) => item.frequency);
    expect(frequencies).toEqual([...frequencies].sort((a, b) => b - a));
  });

  it('matches the words and frequencies from person_words', async () => {
    const res = await request(app).get('/api/persons/nm0000949/words');
    const { rows } = await pool.query<{ word: string; frequency: number }>(
      `SELECT word, frequency::int AS frequency FROM person_words('Cate Blanchett', 10)`
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(rows.length);
    expect(res.body.items).toEqual(rows);
  });

  it('keeps the path in the paging links', async () => {
    const res = await request(app).get('/api/persons/nm0000949/words?limit=3');

    expect(res.body.links.next).toBe('/api/persons/nm0000949/words?limit=3&offset=3');

    const second = await request(app).get(res.body.links.next);
    expect(second.status).toBe(200);
    expect(second.body.offset).toBe(3);
    expect(second.body.links.prev).toBe('/api/persons/nm0000949/words?limit=3&offset=0');
  });


  it('gives 404 for an unknown person', async () => {
    const res = await request(app).get('/api/persons/nm9999999/words');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, error: 'Not Found', message: 'Person not found' });
  });

  it('gives 400 for an invalid nconst', async () => {
    const res = await request(app).get('/api/persons/tm9999999/words');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      error: 'Bad Request',
      message: 'nconst must be a string starting with nm and have at least 7 digits',
    });
  });
});

describe('GET /api/persons/{nconst}/words (size)', () => {
  it('Returns at most 10 words in total', async () => {
    const res = await request(app).get('/api/persons/nm0000949/words?limit=100');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeLessThanOrEqual(10);
    expect(res.body.items.length).toBeLessThanOrEqual(10);
    expect(res.body.total).toEqual(res.body.items.length);
  });

});


// ═════════════════════════════════════════════════════════════════════════════
// TITLES.TS
// ═════════════════════════════════════════════════════════════════════════════

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

describe('GET /api/titles (sorting and filtering)', () => {
  it('sorts by the chosen field and direction', async () => {
    const res = await request(app).get('/api/titles?sort=votes&order=desc&limit=10');

    expect(res.status).toBe(200);
    const votes = res.body.items.map((item: { rating: { votes: number } }) => item.rating.votes);
    expect(votes).toEqual([...votes].sort((a, b) => b - a));
  });

  it('filters by genre and title type, and the total counts only matching titles', async () => {
    const all = await request(app).get('/api/titles?limit=1');
    const res = await request(app).get('/api/titles?genre=Comedy&titleType=movie&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThan(all.body.total);
    for (const item of res.body.items) expect(item.titleType).toBe('movie');
  });

  it('keeps sorting and filters in the paging links', async () => {
    const res = await request(app).get('/api/titles?sort=year&order=desc&titleType=movie&limit=5');

    const next = new URL(res.body.links.next, 'http://localhost');
    expect(next.searchParams.get('sort')).toBe('year');
    expect(next.searchParams.get('order')).toBe('desc');
    expect(next.searchParams.get('titleType')).toBe('movie');
    expect(next.searchParams.get('offset')).toBe('5');
  });

  it('gives 400 for an unknown sort field or direction', async () => {
    const res = await request(app).get('/api/titles?sort=popularity&order=up');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('sort must be one of');
    expect(res.body.message).toContain('order must be one of asc, desc');
  });

  it('gives 400 when sorting or filtering is mixed with a text search', async () => {
    const res = await request(app).get('/api/titles?text=love&sort=rating');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: 400, error: 'Bad Request', message: 'sort cannot be combined with text' });
  });

  it.each([
    ['empty', 'text='],
    ['blank', 'text=%20%20'],
    ['too long', `text=${'a'.repeat(101)}`],
    ['sent twice', 'text=love&text=war'],
  ])('gives 400 for search text that is %s', async (_case, qs) => {
    const res = await request(app).get(`/api/titles?${qs}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: 400, error: 'Bad Request', message: 'text must be 1-100 characters' });
  });

  it('trims the search text', async () => {
    const plain = await request(app).get('/api/titles?text=love');
    const padded = await request(app).get('/api/titles?text=%20love%20');

    expect(padded.status).toBe(200);
    expect(padded.body.total).toBe(plain.body.total);
  });

  it.each([
    ['browsing', 'keyword=war&sort=year', 'keyword'],
    ['searching', 'text=love&sortt=year', 'sortt'],
  ])('gives 400 for a query parameter it does not accept when %s, instead of ignoring it', async (_mode, qs, param) => {
    const res = await request(app).get(`/api/titles?${qs}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: 400, error: 'Bad Request', message: `unknown query parameter '${param}'` });
  });
});

describe('GET /api/titles (keyword search)', () => {
  it.each(['all', 'any', 'weighted'])('gives a paged list of title summaries with match=%s', async (match) => {
    const res = await request(app).get(`/api/titles?keywords=space,war&match=${match}&limit=5`);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(['primaryTitle', 'startYear', 'url']);
    }
  });

  it.each([
    ['any', 'best_match_querying'],
    ['weighted', 'weighted_search'],
  ])('ranks match=%s in the same order as %s', async (match, dbFunction) => {
    const res = await request(app).get(`/api/titles?keywords=space,war,love&match=${match}&limit=50`);
    // The function's own order; called without a user, so nothing is logged
    // (except by best_match_querying, which logs even without a user).
    const { rows } = await pool.query<{ tconst: string }>(
      `SELECT tconst FROM ${dbFunction}(NULL, 'space', 'war', 'love') LIMIT 50`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { url: string }) => item.url.split('/').pop()))
      .toEqual(rows.map(row => row.tconst));
  });

  it('defaults to weighted', async () => {
    const plain = await request(app).get('/api/titles?keywords=space,war');
    const weighted = await request(app).get('/api/titles?keywords=space,war&match=weighted');

    expect(plain.status).toBe(200);
    expect(plain.body.items).toEqual(weighted.body.items);
  });

  it('finds no more titles with all than with any', async () => {
    const all = await request(app).get('/api/titles?keywords=space,war&match=all');
    const any = await request(app).get('/api/titles?keywords=space,war&match=any');

    expect(all.body.total).toBeLessThanOrEqual(any.body.total);
  });

  it('keeps keywords and match in the paging links', async () => {
    const res = await request(app).get('/api/titles?keywords=love&match=any&limit=1');

    expect(res.body.links.next).toContain('keywords=love');
    expect(res.body.links.next).toContain('match=any');
  });

  it.each([
    ['missing', 'match=all', 'keywords is required'],
    ['empty', 'keywords=', 'keywords is required'],
    ['only commas', 'keywords=,,', 'keywords is required'],
    ['sent twice', 'keywords=a&keywords=b', 'keywords must be one comma separated list'],
    ['too many', `keywords=${Array.from({ length: 11 }, (_, i) => `w${i}`).join(',')}`, 'keywords can have at most 10 words'],
    ['too long', `keywords=${'a'.repeat(51)}`, 'each word can be at most 50 characters'],
  ])('gives 400 for keywords that are %s', async (_case, qs, message) => {
    const res = await request(app).get(`/api/titles?${qs}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: 400, error: 'Bad Request', message });
  });

  it('gives 400 for an unknown match', async () => {
    const res = await request(app).get('/api/titles?keywords=war&match=some');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('match must be one of all, any, weighted');
  });

  it.each([
    ['browsing', 'keywords=war&sort=rating', 'sort cannot be combined with keywords'],
    ['text search', 'text=love&keywords=war', 'keywords cannot be combined with text'],
  ])('gives 400 when mixed with %s', async (_mode, qs, message) => {
    const res = await request(app).get(`/api/titles?${qs}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
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
    expect(res.body).toEqual({ status: 404, error: 'Not Found', message: 'Title not found' });
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
    expect(res.body).toEqual({ status: 404, error: 'Not Found', message: 'Title not found' });
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
    expect(res.body).toEqual({ status: 404, error: 'Not Found', message: 'Title not found' });
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// USERS.TS
// ═════════════════════════════════════════════════════════════════════════════

describe('AUTH on /api/users/{uconst}/...', () => {
  let userOneId: number;
  let userTwoId: number;
  let cookie: string;

  beforeAll(async () => {
      const passwordHash = await hashPassword('password');
      const useOneUsername = 'test_user_one';
      const useTwoUsername = 'test_user_two';
      const userOne = await pool.query(`
        SELECT create_user($1,$2,$3,$4,$5) as uconst`,
        ['TestOne', 'UserOne', 'test_user_one', `${useOneUsername}@test.com`, passwordHash])

      const userTwo = await pool.query(`
        SELECT create_user($1,$2,$3,$4,$5) as uconst`,
        ['TestTwo', 'UserTwo', 'test_user_two', `${useTwoUsername}@test.com`, passwordHash])
    
      userOneId = userOne.rows[0].uconst;
      userTwoId = userTwo.rows[0].uconst;

      const res = await request(app).post('/api/auth/token')
                                    .send({ username: useTwoUsername, password: 'password'});
    cookie = jwtCookie(res);
    });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userOneId]);
    await pool.query('SELECT delete_user($1)', [userTwoId]);
  });
  

  it('Return 401 without a token', async () => {
    const res = await request(app).get(`/api/users/${userOneId}/search-history`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error:"Unauthorized", message:"Missing token" });
  });

  it('Return 401 for an expired token', async () => {
    const res = await request(app).get(`/api/users/${userOneId}/search-history`)
                                  .set('Cookie', `${TOKEN_COOKIE}=bad`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error:"Unauthorized", message: "Invalid or expired token" });
  });

  it('Returns 403 for anothers users token', async () => {
    const res = await request(app).get(`/api/users/${userOneId}/search-history`)
                  .set('Cookie', cookie);
    
                  expect(res.status).toBe(403);
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
      .send({currentPassword: 'password', newPassword: 'NewPassw0rd!'});
    
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


// ═════════════════════════════════════════════════════════════════════════════
// WORDS.TS
// ═════════════════════════════════════════════════════════════════════════════

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