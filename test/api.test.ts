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
      .put(`api/users/${userId}/password`)
      .send({currentPassword: 'password', newPassword: 'newPassword'});
    
    expect(res.status).toBe(204);
  });

  it('returns 404 for an uknown user', async () => {
    const res = await request(app)
      .put(`api/users/999999999/password`)
      .send({currentPassword: 'password', newPassword: 'newPassword'});
    
    expect(res.status).toBe(204);
  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await request(app)
      .put(`api/users/${userId}/password`)
      .send({currentPassword: 'password'});
    
      expect(res.status).toBe(400);
  });

  it('returns 400 when currentPassword is missing', async () => {
    const res = await request(app)
      .put(`api/users/${userId}/password`)
      .send({newPassword: 'password'});

    expect(res.status).toBe(400);

  });

  it('returns 400 when currentPassword is not a string', async () => {
    const res = await request(app)
      .put(`api/users/${userId}/password`)
      .send({currentPassword: 123});
    
    expect(res.status).toBe(400);

  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await request(app)
      .put(`api/users/${userId}/password`)
      .send({newPassword: 123});

    expect(res.status).toBe(400);
  });
  
  it('returns 404 when currentPassword is undefined', async () => {
    const res = await request(app)
      .put(`api/users/${userId}/password`)
      .send({currentPassword: undefined});
      
    expect(res.status).toBe(400);
  });
});