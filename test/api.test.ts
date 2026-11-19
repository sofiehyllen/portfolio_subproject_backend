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

  it('Returns 200 with the user URI, no token in body and an HttpOnly jwt cookie', async () => {
    const res = await request(app).post('/api/auth/token')
                                  .send({ username, password: 'password' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: `/api/users/${userId}` });

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
  
  it('Returns 204 and clears the cookies', async () => {
    const res = await request(app).delete('/api/auth/token');

    expect(res.status).toBe(204);
    const cookie = jwtCookie(res);
    expect(cookie).toMatch(new RegExp(`^${TOKEN_COOKIE}=;`));
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// PERSONS.TS
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/persons (name filter)', () => {
  it('Returns only persons matching the name, case-insensitive', async () => {
    const res = await request(app).get('/api/persons?name=blanchett');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.primaryName.toLowerCase()).toContain('blanchett');
    }

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

  it('Returns actors with ActorsOnly=true with no name', async () => {
    const res = await request(app).get('/api/persons?actorsOnly=true')
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request', message:"actorsOnly requires name" });
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

  it('Returns 400 for an uknown sorting direction', async () => {
    const res = await request(app).get('/api/persons?sort=rating&order=up');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Bad Request", message:"order must be one of asc, desc" });
  });
});

describe('GET /api/persons (query parameters)', () => {
  it('Returns 400 for an uknown sort field', async () => {
    const res = await request(app).get('/api/persons?wrongField=abc');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Bad Request", message: "unknown query parameter 'wrongField'" });
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

describe('GET /api/persons/{nconst}/titles (ordering)', () => {
  it('Keeps the path in the paging links', async () => {
    const res = await request(app).get('/api/persons/nm0000949/titles?limit=1&offset=1');

    expect(res.status).toBe(200);
    expect(res.body.links.prev).toContain("/api/persons/nm0000949/titles?limit=1&offset=0");
    expect(res.body.links.next).toContain("/api/persons/nm0000949/titles?limit=1&offset=2");

  });
});

describe('GET api/persons/{nconst}/co-players', () => {
  it('Returns only matching co-players for a valid search', async () => {
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
  });

  it('returns 404 when person is not found', async () => {
    const res = await request(app).get('/api/persons/nm9999999/co-players');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      "status":404,
      "error":"Not Found",
      "message":"Person not found"});

  });

});

describe('GET /api/persons/{nconst}/words', () => {

  it('matches the words and frequencies from person_words', async () => {
    const res = await request(app).get('/api/persons/nm0000949/words');
    const { rows } = await pool.query<{ word: string; frequency: number }>(
      `SELECT word, frequency::int AS frequency FROM person_words('Cate Blanchett', 10)`
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(rows.length);
    expect(res.body.items).toEqual(rows);
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
});

describe('GET /api/titles (text search)', () => {
  it('returns title summaries ordered by tconst', async () => {
    const res = await request(app).get('/api/titles?text=love&limit=50');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(['primaryTitle', 'startYear', 'url']);
    }

    const tconsts = res.body.items.map((item: { url: string }) => item.url.split('/').pop());
    expect(tconsts).toEqual([...tconsts].sort());
  });
});

describe('GET /api/titles (keyword search)', () => {
  it('gives a paged list of title summaries with match=all', async () => {
    const res = await request(app).get('/api/titles?keywords=space,war&match=all&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(['primaryTitle', 'startYear', 'url']);
    }
  });
});

describe('GET /api/titles (structured search)', () => {
  it.each([
    ['title', 'title=love'],
    ['plot', 'plot=war'],
    ['character', 'character=galadriel'],
    ['person', 'person=blanchett'],
    ])('finds titles by %s, case-insensitive', async (_field, qs) => {
    const [name, value] = qs.split('=');
    const res = await request(app).get(`/api/titles?${name}=${value.toUpperCase()}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(['primaryTitle', 'startYear', 'url']);
    }
  });

  it('requires every given field to match', async () => {
    const one = await request(app).get('/api/titles?person=blanchett');
    const both = await request(app).get('/api/titles?person=blanchett&character=galadriel');

    expect(both.status).toBe(200);
    expect(both.body.total).toBeGreaterThan(0);
    expect(both.body.total).toBeLessThan(one.body.total);
  });

  it.each([
    ['text', 'title=love&text=love'],
    ['keywords', 'title=love&keywords=war'],
  ])('gives 400 when mixed with %s', async (_mode, qs) => {
    const res = await request(app).get(`/api/titles?${qs}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request' });
  });

  it.each([
    ['sort', 'title=love&sort=year'],
    ['a filter', 'title=love&genre=Comedy'],
  ])('gives 400 when mixed with %s', async (_mode, qs) => {
    const res = await request(app).get(`/api/titles?${qs}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request' });
  });
});

describe('GET /api/titles (sorting and filtering)', () => {
  it.each(['asc', 'desc'])('sorts by year in %s order with missing years last', async (order) => {
    const first = await request(app).get(`/api/titles?sort=year&order=${order}&limit=100`);
    const last = await request(app).get(`/api/titles?sort=year&order=${order}&limit=100&offset=${first.body.total - 100}`);

    expect(first.status).toBe(200);
    const years = first.body.items.map((item: { startYear: number | null }) => item.startYear);
    expect(years.every((year: number | null) => year !== null)).toBe(true);
    expect(years).toEqual([...years].sort((a, b) => order === 'asc' ? a - b : b - a));

    expect(last.body.items.at(-1).startYear).toBeNull();
  });

  it('filters by genre case-insensitively', async () => {
    const proper = await request(app).get('/api/titles?genre=Comedy&limit=1');
    const upper = await request(app).get('/api/titles?genre=COMEDY&limit=1');

    expect(upper.status).toBe(200);
    expect(proper.body.total).toBeGreaterThan(0);
    expect(upper.body.total).toBe(proper.body.total);
  });

  it.each([
    ['genre', 'genre=NoSuchGenre'],
    ['title type', 'titleType=noSuchType'],
  ])('gives an empty list for an unknown %s', async (_name, qs) => {
    const res = await request(app).get(`/api/titles?${qs}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, items: [] });
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

  it.each([
    ['no tt prefix', '0063929'],
    ['6 digits', 'tt123456'],
    ['9 digits', 'tt123456789'],
  ])('gives 400 for an invalid tconst: %s', async (_case, tconst) => {
    const res = await request(app).get(`/api/titles/${tconst}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request', message: 'tconst must start with tt followed by 7-8 digits' });
  });
});

describe('GET /api/titles/{tconst}/actors', () => {
  it('returns a page of actors, highest name rating first', async () => {
    const res = await request(app).get('/api/titles/tt0063929/actors?limit=3');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 3, offset: 0 });
    expect(res.body.items.length).toBeLessThanOrEqual(3);

    const ratings = res.body.items.map((actor: { nameRating: number | null }) => actor.nameRating ?? -1);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    for (const actor of res.body.items) {
      expect(actor.url).toMatch(/^\/api\/persons\/nm\d+$/);
    }
  });
});

describe('GET /api/titles/{tconst}/similar', () => {
  // The title types of the titles similar to the first title of the given type.
  async function similarTypes(titleType: string): Promise<string[]> {
    const list = await request(app).get(`/api/titles?titleType=${titleType}&limit=1`);
    const similar = await request(app).get(`${list.body.items[0].url}/similar?limit=20`);

    return Promise.all(similar.body.items.map(async (item: { url: string }) =>
      (await request(app).get(item.url)).body.titleType));
  }

  it('returns a page of movies, most shared genres first', async () => {
    const res = await request(app).get('/api/titles/tt0111596/similar?limit=5');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 5, offset: 0 });
    expect(res.body.items.length).toBeGreaterThan(0);

    const scores = res.body.items.map((movie: { similarityScore: number }) => movie.similarityScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const movie of res.body.items) {
      expect(movie.url).toMatch(/^\/api\/titles\/tt\d+$/);
      expect(movie.commonGenres).toHaveLength(movie.similarityScore);
    }
  });

  it('matches movie and tvMovie with each other', async () => {
    const types = await similarTypes('tvMovie');

    expect(types).toContain('movie');
    for (const type of types) expect(['movie', 'tvMovie']).toContain(type);
  });

  it.each(['tvEpisode', 'short'])('gives an empty list for %s', async (titleType) => {
    const list = await request(app).get(`/api/titles?titleType=${titleType}&limit=1`);
    const res = await request(app).get(`${list.body.items[0].url}/similar`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, items: [] });
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
      const userOne = await pool.query(`
        SELECT create_user($1,$2,$3,$4,$5) as uconst`,
        ['TestOne', 'UserOne', 'test_user_one', `user_one@test.com`, passwordHash])

      const userTwo = await pool.query(`
        SELECT create_user($1,$2,$3,$4,$5) as uconst`,
        ['TestTwo', 'UserTwo', 'test_user_two', `user_two@test.com`, passwordHash])
    
      userOneId = userOne.rows[0].uconst;
      userTwoId = userTwo.rows[0].uconst;

      const res = await request(app).post('/api/auth/token')
                                    .send({ username: "test_user_two", password: 'password'});
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

  it('Return 401 for a garbage token', async () => {
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

  it('Returns 400 for an invalid uconst', async () => {
    const res = await request(app).get('/api/users/abc')
                                  .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request' });
  });

});


describe('POST /api/users', () => {
  let takenId: number;
  let newId: number | undefined;

  beforeAll(async () => {
    const passwordHash = await hashPassword('password');
    const result = await pool.query(`
      SELECT create_user($1, $2, $3, $4, $5) as uconst`,
      ['Test', 'User', 'users_taken', 'user_taken@test.com', passwordHash]);
    
    takenId = result.rows[0].uconst;
  });

  afterAll(async () => {
    await pool.query(`SELECT delete_user($1)`, [takenId]);
    
    if (newId) {
      await pool.query('select delete_user($1)', [newId]);
    }
  });

  it('Return 201 with the profile and a Location header, without the password', async () => {
    const res = await request(app).post('/api/users')
                .send({ firstName: 'Test', 
                        lastName: 'User', 
                        username: 'users_new', 
                        email: 'users_new@test.com',
                        password: 'NewPassw0rd!'});
    
    expect(res.status).toBe(201);
    newId = Number(res.body.url.split('/').pop());
    expect(res.headers.location).toBe(res.body.url);
    expect(res.body).toMatchObject({ username: 'users_new', email: 'users_new@test.com'});
    expect(Object.keys(res.body).sort()).toEqual([
      'createdAt', 'email', 'firstName', 'lastName', 'url', 'username']);
  });

  it('Return 400 when username is missing', async () => {
    const res = await request(app).post('/api/users')
                .send( { 
                  firstName: 'Test',
                  lastName: 'User',
                  email: 'users_bad@test.com',
                  password: 'NewPassw0rd!'});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request'});
  });

  it('Return 400 when password is too short', async () => {
    const res = await request(app).post('/api/users')
                .send( { 
                  firstName: 'Test',
                  lastName: 'User',
                  username: 'users_bad',
                  email: 'users_bad@test.com',
                  password: 'pswd'});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request'});
  });

  it('Return 409 when username is taken', async () => {
    const res = await request(app).post('/api/users')
                .send( { 
                  firstName: 'Test',
                  lastName: 'User',
                  username: 'users_taken',
                  email: 'users_other@test.com',
                  password: 'NewPassw0rd!'});
                  
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Conflict'});
  });

  it('Return 409 when email is taken', async () => {
    const res = await request(app).post('/api/users')
                .send( { 
                  firstName: 'Test',
                  lastName: 'User',
                  username: 'users_random',
                  email: 'user_taken@test.com',
                  password: 'NewPassw0rd!'});
                  
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Conflict'});
  });
});

describe('PATCH /api/users/{uconst}', () => {
  let userId: number;
  let otherId: number;
  let cookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('password');
    const user = await pool.query(`
      select create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', 'users_patch', 'users_patch@test.com', passwordHash]);

    const other = await pool.query(`
      select create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'Other', 'users_path_other', 'users_patch_other@test.com', passwordHash]);

    userId = user.rows[0].uconst;
    otherId = other.rows[0].uconst;
    
    const res = await request(app).post('/api/auth/token')
                                  .send({ username: 'users_patch', password: 'password'});
    cookie = jwtCookie(res);
  });

  afterAll(async () => {
    await pool.query(`SELECT delete_user($1)`, [userId]);
    await pool.query(`SELECT delete_user($1)`, [otherId]);   
  });

  it('Returns 200 and changes only the field that is sent', async () => {
    const res = await request(app).patch(`/api/users/${userId}`)
                .set('Cookie', cookie)
                .send( {firstName: 'Changed'});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'Changed',
      lastName: 'User',
      username: 'users_patch'});
  });

  it('Returns 400 when username is sent', async () => {
    const res = await request(app).patch(`/api/users/${userId}`)
                .set('Cookie', cookie)
                .send( { username: 'users_changed'});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request'});
  });

  it('Returns 409 when email is taken', async () => {
    const res = await request(app).patch(`/api/users/${userId}`)
                .set('Cookie', cookie)
                .send( { email: 'users_patch_other@test.com'});

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Conflict'});
  });
})

describe('PUT /api/users/{uid}/password', () => {
  let userId: number;
  let cookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('password');
    const user = await pool.query(`
      select create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', 'users_put', 'users_put@test.com', passwordHash]);

    userId = user.rows[0].uconst;

    
    const res = await request(app).post('/api/auth/token')
                                  .send({ username: 'users_put', password: 'password'});
    cookie = jwtCookie(res);
  });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userId]);
  });

  it('Returns 403 when the current password is not correct', async () => {
    const res = await request(app).put(`/api/users/${userId}/password`)
                .set('Cookie', cookie)
                .send({ currentPassword: 'wrongPswd', newPassword: 'NewPassw0rd!'});
    
    expect(res.status).toBe(403);
  });

  it('Returns 400 when the new password is not long enough', async () => {
    const res = await request(app).put(`/api/users/${userId}/password`)
                .set('Cookie', cookie)
                .send({ currentPassword: 'password', newPassword: 'NewP0!'});
    
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request'});
  });

  it('returns 204 for a valid password update', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}/password`)
      .set('Cookie', cookie)
      .send({currentPassword: 'password', newPassword: 'NewPassw0rd!'});
    
    expect(res.status).toBe(204);

    const newLogin = await request(app).post('/api/auth/token')
                    .send({username: 'users_put', password: 'NewPassw0rd!'});
    const oldLogin = await request(app).post('/api/auth/token')
                    .send({username: 'users_put', password: 'password'});

    expect(newLogin.status).toBe(200);
    expect(oldLogin.status).toBe(401);
  });
});


describe('DELETE /api/users/{uconst}', () => {
    let userId: number;
    let cookie: string;

    beforeAll(async () => {
    const passwordHash = await hashPassword('password');
    const user = await pool.query(`
      select create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', 'users_delete', 'users_delete@test.com', passwordHash]);

    userId = user.rows[0].uconst;

    
    const res = await request(app).post('/api/auth/token')
                                  .send({ username: 'users_delete', password: 'password'});
    cookie = jwtCookie(res);
  });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userId]);
  });

  it('Returns 204, the user is gone and the votes of the rated titles are restored', async () => {
    const before = await request(app).get('/api/titles/tt4924682');
    await request(app).put(`/api/users/${userId}/ratings/tt4924682`)
                      .set('Cookie', cookie)
                      .send({rating: 8});


    const res = await request(app).delete(`/api/users/${userId}`)
                                  .set('Cookie', cookie);

    expect(res.status).toBe(204);

    const deleted = await request(app).get(`/api/users/${userId}`)
                                  .set('Cookie', cookie);
    const afterRatingChange = await request(app).get(`/api/titles/tt4924682`);

    expect(deleted.status).toBe(404);
    expect(afterRatingChange.body.rating.votes).toBe(before.body.rating.votes);
  });
});

describe('Ratings on /api/users/{uconst}/ratings/{tconst}', () => {
  let userId: number;
  let cookie: string;
  let votes: number;

  beforeAll(async () => {
  const passwordHash = await hashPassword('password');
  const user = await pool.query(`
    select create_user($1, $2, $3, $4, $5) as uconst`,
  ['Test', 'User', 'users_rating', 'users_rating@test.com', passwordHash]);

  userId = user.rows[0].uconst;

  
  const res = await request(app).post('/api/auth/token')
                                .send({ username: 'users_rating', password: 'password'});
  cookie = jwtCookie(res);

  const title = await request(app).get('/api/titles/tt4924682');
  votes = title.body.rating.votes;
});

afterAll(async () => {
  await pool.query('SELECT delete_user($1)', [userId]);
});

it('Return 201 for a new rating and counts it as a vote', async () => {
  const res = await request(app).put(`/api/users/${userId}/ratings/tt4924682`)
  .set('Cookie', cookie)
  .send({ rating: 8 });

  const title = await request(app).get('/api/titles/tt4924682');

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ rating: 8 });
  expect(title.body.rating.votes).toBe(votes + 1);
});

it('Return 200 and the active rating', async () => {
  const res = await request(app).put(`/api/users/${userId}/ratings/tt4924682`)
  .set('Cookie', cookie)
  .send({ rating: 9 });

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ rating: 9 });
});

it('Return 400 when the rating is outside of 1-10', async () => {
  const res = await request(app).put(`/api/users/${userId}/ratings/tt4924682`)
  .set('Cookie', cookie)
  .send({ rating: 44 });

  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'Bad Request'});
});

it('Return 404 when title not found', async () => {
  const res = await request(app).put(`/api/users/${userId}/ratings/tt2402927`)
  .set('Cookie', cookie)
  .send({ rating: 8 });

  expect(res.status).toBe(404);
});

it('Return 204 when rating is deleted and takes back the vote', async () => {
  const res = await request(app).delete(`/api/users/${userId}/ratings/tt4924682`)
  .set('Cookie', cookie)

  const title = await request(app).get('/api/titles/tt4924682');

  expect(res.status).toBe(204);
  expect(title.body.rating.votes).toBe(votes);
});

it('Return 404 when removing the same rating', async () => {
  const res = await request(app).delete(`/api/users/${userId}/ratings/tt4924682`)
  .set('Cookie', cookie)

  expect(res.status).toBe(404);
});

it('Return 201 when the rating again', async () => {
  const res = await request(app).put(`/api/users/${userId}/ratings/tt4924682`)
  .set('Cookie', cookie)
  .send({ rating: 7 });

  expect(res.status).toBe(201);

});

});

describe('Bookmarks on /api/users/{uconst}/bookmarks', () => {
  let userId: number;
  let cookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('password');
    const result = await pool.query(`
      SELECT create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', 'users_bookmark', 'users_bookmark@test.com', passwordHash]);

    userId = result.rows[0].uconst;

    const res = await request(app).post('/api/auth/token')
                                  .send({ username: 'users_bookmark', password: 'password' });
    cookie = jwtCookie(res);
  });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userId]);
  });

  it('Returns 204 for a title bookmark, which shows in the list', async () => {
    const res = await request(app).put(`/api/users/${userId}/bookmarks/titles/tt0111596`)
                                  .set('Cookie', cookie);
    const list = await request(app).get(`/api/users/${userId}/bookmarks/titles`)
                                   .set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ title: '/api/titles/tt0111596' });
  });

  it('Returns 204 and changes nothing when bookmarking the same title again', async () => {
    const res = await request(app).put(`/api/users/${userId}/bookmarks/titles/tt0111596`)
                                  .set('Cookie', cookie);
    const list = await request(app).get(`/api/users/${userId}/bookmarks/titles`)
                                   .set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(list.body.total).toBe(1);
  });

  it('Returns 404 when bookmarking an unknown title', async () => {
    const res = await request(app).put(`/api/users/${userId}/bookmarks/titles/tt0000000`)
                                  .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });

  it('Returns 204 when removing a title bookmark, which is then gone', async () => {
    const res = await request(app).delete(`/api/users/${userId}/bookmarks/titles/tt0111596`)
                                  .set('Cookie', cookie);
    const list = await request(app).get(`/api/users/${userId}/bookmarks/titles`)
                                   .set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(list.body.total).toBe(0);
  });

  it('Returns 404 when removing the title bookmark again', async () => {
    const res = await request(app).delete(`/api/users/${userId}/bookmarks/titles/tt0111596`)
                                  .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });

  it('Returns 204 for a person bookmark, which shows in the list', async () => {
    const res = await request(app).put(`/api/users/${userId}/bookmarks/persons/nm0000949`)
                                  .set('Cookie', cookie);
    const list = await request(app).get(`/api/users/${userId}/bookmarks/persons`)
                                   .set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(list.body.items[0]).toMatchObject({ person: '/api/persons/nm0000949' });
  });

  it('Returns 404 when removing a person that is not bookmarked', async () => {
    const res = await request(app).delete(`/api/users/${userId}/bookmarks/persons/nm0000054`)
                                  .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });
});

describe('Search history on /api/users/{uconst}/search-history', () => {
  let userId: number;
  let otherId: number;
  let cookie: string;
  let otherCookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('password');
    const user = await pool.query(`
      SELECT create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', 'users_history', 'users_history@test.com', passwordHash]);
    const other = await pool.query(`
      SELECT create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'Other', 'users_history_other', 'users_history_other@test.com', passwordHash]);

    userId = user.rows[0].uconst;
    otherId = other.rows[0].uconst;

    const res = await request(app).post('/api/auth/token')
                                  .send({ username: 'users_history', password: 'password' });
    const otherRes = await request(app).post('/api/auth/token')
                                       .send({ username: 'users_history_other', password: 'password' });
    cookie = jwtCookie(res);
    otherCookie = jwtCookie(otherRes);
  });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userId]);
    await pool.query('SELECT delete_user($1)', [otherId]);
  });

  it('Returns a logged search', async () => {
    await request(app).get('/api/titles?text=love')
                      .set('Cookie', cookie);

    const res = await request(app).get(`/api/users/${userId}/search-history`)
                                  .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].searchString).toContain('love');
  });

  it('Returns 404 when deleting the entry of another user', async () => {
    await request(app).get('/api/titles?text=space')
                      .set('Cookie', otherCookie);
    const other = await request(app).get(`/api/users/${otherId}/search-history`)
                                    .set('Cookie', otherCookie);
    const sconst = other.body.items[0].url.split('/').pop();

    const res = await request(app).delete(`/api/users/${userId}/search-history/${sconst}`)
                                  .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });

  it('Returns 204 when deleting an entry, which is then gone', async () => {
    const history = await request(app).get(`/api/users/${userId}/search-history`)
                                      .set('Cookie', cookie);

    const res = await request(app).delete(history.body.items[0].url)
                                  .set('Cookie', cookie);
    const after = await request(app).get(`/api/users/${userId}/search-history`)
                                    .set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(after.body.total).toBe(0);
  });

  it('Returns 204 when clearing the whole history', async () => {
    await request(app).get('/api/titles?text=love')
                      .set('Cookie', cookie);
    await request(app).get('/api/titles?text=war')
                      .set('Cookie', cookie);

    const res = await request(app).delete(`/api/users/${userId}/search-history`)
                                  .set('Cookie', cookie);
    const after = await request(app).get(`/api/users/${userId}/search-history`)
                                    .set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(after.body.total).toBe(0);
  });
});



// ═════════════════════════════════════════════════════════════════════════════
// WORDS.TS
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/related-words', () => {
    let userId: number;
  let cookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('password');
    const user = await pool.query(`
      select create_user($1, $2, $3, $4, $5) as uconst`,
    ['Test', 'User', 'users_words', 'users_words@test.com', passwordHash]);

    userId = user.rows[0].uconst;

    
    const res = await request(app).post('/api/auth/token')
                                  .send({ username: 'users_words', password: 'password'});
    cookie = jwtCookie(res);
  });

  afterAll(async () => {
    await pool.query('SELECT delete_user($1)', [userId]);
  });

  it('returns the most associated words, most frequent first, without the given words', async () => {
    const res = await request(app).get('/api/related-words?words=space,war');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(['count', 'word']);
    }

    const counts = res.body.items.map((item: { count: number }) => item.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    const found = res.body.items.map((item: { word: string }) => item.word);
    expect(found).not.toContain('space');
    expect(found).not.toContain('war');
  });

  it('Returns an empty page with the correct total past the last page', async () => {
    const all = await request(app).get('/api/related-words?words=space');
    const res = await request(app).get(`/api/related-words?words=space&offset=${all.body.total}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: all.body.total, items: [] });
  });

  it('Does not log the search in the history', async () => {
    await request(app).get('/api/related-words?words=space')
                      .set('Cookie', cookie);

    const res = await request(app).get(`/api/users/${userId}/search-history`)
                                  .set('Cookie', cookie);

    expect(res.body.total).toBe(0);
  });
});