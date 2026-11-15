/**
 * Data-access layer for the `bookmark_title` and `bookmark_person` tables.
 *
 * Types:
 * - `BookmarkTitle` — a bookmarked title row: tconst, title name and creation timestamp.
 * - `BookmarkPerson` — a bookmarked person row: nconst, person name and creation timestamp.
 *
 * Query functions:
 * - `countTitleBookmarks(uconst)` — total number of title bookmarks for the user.
 * - `countPersonBookmarks(uconst)` — total number of person bookmarks for the user.
 * - `getTitleBookmarks(uconst, limit, offset)` — paged title bookmarks, newest first.
 * - `addTitleBookmark(uconst, tconst)` — creates a bookmark; returns false if the title does not exist.
 * - `removeTitleBookmark(uconst, tconst)` — removes a bookmark; returns false if none was found.
 * - `getPersonBookmarks(uconst, limit, offset)` — paged person bookmarks, newest first.
 * - `addPersonBookmark(uconst, nconst)` — creates a bookmark; returns false if the person does not exist.
 * - `removePersonBookmark(uconst, nconst)` — removes a bookmark; returns false if none was found.
 */
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
    ORDER BY "createdAt" DESC, tconst
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

// Removes a title bookmark with remove_title_bookmark(), which returns
// whether a bookmark was deleted.
// Returns false (→ 404) when the user has no bookmark of the title.
export async function removeTitleBookmark(uconst: number, tconst: string): Promise<boolean> {
  const { rows } = await pool.query<{ deleted: boolean }>(
    'SELECT remove_title_bookmark($1, $2) AS deleted',
    [uconst, tconst]
  );
  return rows[0].deleted;
}

//Get list of users bookmarked persons
export async function getPersonBookmarks(uconst: number, limit: number, offset: number): Promise<BookmarkPerson[]> {
  const { rows } = await pool.query<BookmarkPerson>(
    `SELECT nconst, 
            person_name AS "person", 
            created_at AS "createdAt"
    FROM get_person_bookmarks($1)
    ORDER BY "createdAt" DESC, nconst
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

// Removes a person bookmark with remove_person_bookmark(), which returns
// whether a bookmark was deleted.
// Returns false (→ 404) when the user has no bookmark of the person.
export async function removePersonBookmark(uconst: number, nconst: string): Promise<boolean> {
  const { rows } = await pool.query<{ deleted: boolean }>(
    'SELECT remove_person_bookmark($1, $2) AS deleted',
    [uconst, nconst]
  );
  return rows[0].deleted;
}
