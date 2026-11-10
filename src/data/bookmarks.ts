import { pool } from '../db.js';

export interface BookmarkTitle {
  tconst: string;
  title: string;
  createdAt: Date;
}

export interface BookmarkPerson {
  nconst: string;
  person: string;
  createdAt: Date;
}

// Count all title bookmarks of a user
export async function countTitleBookmarks(uconst: number): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS "total"
      FROM bookmark_title
      WHERE uconst = $1`,
    [uconst]);
  return rows[0].total;
}

// Count all person bookmarks of a user
export async function countPersonBookmarks(uconst: number): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS "total"
      FROM bookmark_person
      WHERE uconst = $1`,
    [uconst]);
  return rows[0].total;
}

//Get list of users bookmarked titles
export async function getTitleBookmarks(uconst: number, limit: number, offset: number): Promise<BookmarkTitle[]> {
  const { rows } = await pool.query<BookmarkTitle>(
    `SELECT tconst, 
            title_name AS "title", 
            created_at AS "createdAt"
    FROM get_title_bookmarks($1)
    LIMIT $2
    OFFSET $3`,
    [uconst, limit, offset]
  );
  return rows;
}

// Create title bookmark
export async function addTitleBookmark(uconst: number, tconst: string): Promise<boolean> {
  const title = await pool.query('SELECT 1 FROM titles WHERE tconst = $1', [tconst]);
  if (!title.rowCount) return false;

  await pool.query('SELECT add_title_bookmark($1, $2)', [uconst, tconst]);
  return true;
}

// Delete title bookmark
export async function removeTitleBookmark(uconst: number, tconst: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if the bookmark exists; return false (→ 404) if not
    const { rowCount } = await client.query(
      `SELECT 1 FROM bookmark_title WHERE uconst = $1 AND tconst = $2`,
      [uconst, tconst]
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(`SELECT remove_title_bookmark($1, $2)`, [uconst, tconst]);

    await client.query('COMMIT');
    return true;
      
  } catch (err) {
      await client.query('ROLLBACK');
      throw err;
  } finally {
      client.release();
  }
}

//Get list of users bookmarked persons
export async function getPersonBookmarks(uconst: number, limit: number, offset: number): Promise<BookmarkPerson[]> {
  const { rows } = await pool.query<BookmarkPerson>(
    `SELECT nconst, 
            person_name AS "person", 
            created_at AS "createdAt"
    FROM get_person_bookmarks($1)
    LIMIT $2
    OFFSET $3`,
    [uconst, limit, offset]
  );
  return rows;
}

// Create person bookmark
export async function addPersonBookmark(uconst: number, nconst: string): Promise<boolean> {
  const person = await pool.query('SELECT 1 FROM persons WHERE nconst = $1', [nconst]);
  if (!person.rowCount) return false;

  await pool.query('SELECT add_person_bookmark($1, $2)', [uconst, nconst]);
  return true;
}

// Delete person bookmark
export async function removePersonBookmark(uconst: number, nconst: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if the bookmark exists; return false (→ 404) if not
    const { rowCount } = await client.query(
      `SELECT 1 FROM bookmark_person WHERE uconst = $1 AND nconst = $2`,
      [uconst, nconst]
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(`SELECT remove_person_bookmark($1, $2)`, [uconst, nconst]);

    await client.query('COMMIT');
    return true;
      
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}