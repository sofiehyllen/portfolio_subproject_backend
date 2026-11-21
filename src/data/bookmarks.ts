/**
 * Data-access layer for the `bookmark_title` and `bookmark_person` tables.
 *
 * Types:
 * - `BookmarkTitle` — a bookmarked title row: tconst, title name and creation timestamp.
 * - `BookmarkPerson` — a bookmarked person row: nconst, person name and creation timestamp.
 *
 * Query functions:
 * - `countTitles(uconst)` — total number of title bookmarks for the user.
 * - `countPersons(uconst)` — total number of person bookmarks for the user.
 * - `listTitles(uconst, limit, offset)` — paged title bookmarks, newest first.
 * - `addTitle(uconst, tconst)` — creates a title bookmark.
 * - `removeTitle(uconst, tconst)` — removes a title bookmark; returns false if none was found.
 * - `listPersons(uconst, limit, offset)` — paged person bookmarks, newest first.
 * - `addPerson(uconst, nconst)` — creates a person bookmark.
 * - `removePerson(uconst, nconst)` — removes a person bookmark; returns false if none was found.
 */
import { pool } from '../db.js';

/**
 * A title bookmarked by a user
 * @property tconst     - ID of the bookmarked title
 * @property title      - name of the title
 * @property createdAt  - when the bookmark was created
 */
export interface BookmarkTitle {
  tconst: string;
  title: string;
  createdAt: Date;
}

/**
 * A person bookmarked by a user
 * @property nconst       - ID of the bookmarked person
 * @property person       - name of the person
 * @property createdAt    - when the bookmark was created
 */
export interface BookmarkPerson {
  nconst: string;
  person: string;
  createdAt: Date;
}

/**
 * Count all title bookmarks of a user
 * @param uconst    - ID of the user
 * @returns           the number of title bookmarks
 */
export async function countTitles(uconst: number): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS "total"
      FROM bookmark_title
      WHERE uconst = $1`,
    [uconst]);
  return rows[0].total;
}

/**
 * Count all person bookmarks of a user
 * @param uconst    - ID of the user
 * @returns           the number of person bookmarks
 */
export async function countPersons(uconst: number): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS "total"
      FROM bookmark_person
      WHERE uconst = $1`,
    [uconst]);
  return rows[0].total;
}

/**
 * Gets a page of the user's title booksmarks with `get_title_bookmarks()`, newest first (ties broken by tconst)
 * 
 * @param uconst          - ID of the user
 * @param limit           - maximum number of bookmarks to return
 * @param offset          - number of bookmarks to skip
 * @returns                 the bookmarks on this page
 */
export async function listTitles(uconst: number, limit: number, offset: number): Promise<BookmarkTitle[]> {
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

/**
 * Create title bookmark with `add_title_bookmark()`
 * 
 * @param uconst    - ID of the user
 * @param tconst    - ID of the title
 */
export async function addTitle(uconst: number, tconst: string): Promise<void> {
  await pool.query('SELECT add_title_bookmark($1, $2)', [uconst, tconst]);
}

/**
 * Removes a title bookmark with `remove_title_bookmark()`
 * @param uconst        - ID of the user
 * @param tconst        - ID of the title
 * @returns               `false` when the user has no bookmarks of the title
 */
export async function removeTitle(uconst: number, tconst: string): Promise<boolean> {
  const { rows } = await pool.query<{ deleted: boolean }>(
    'SELECT remove_title_bookmark($1, $2) AS deleted',
    [uconst, tconst]
  );
  return rows[0].deleted;
}

/**
 * Gets a page of the user's person bookmarks with `get_person_bookmarks()`, newst first (ties broken by nconst)
 * 
 * @param uconst        - ID of the user
 * @param limit         - maximum number of bookmarks to return
 * @param offset        - number of bookmarks to skip
 * @returns               the bookmarks on this page
 */
export async function listPersons(uconst: number, limit: number, offset: number): Promise<BookmarkPerson[]> {
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

/**
 * Create person bookmark with `add_person_bookmark()`
 * @param uconst      - ID of the user
 * @param nconst      - ID of the person
 */
export async function addPerson(uconst: number, nconst: string): Promise<void> {
  await pool.query('SELECT add_person_bookmark($1, $2)', [uconst, nconst]);
}

/**
 * Removes a person bookmark with `remove_person_bookmark()`
 * @param uconst      - ID of the user
 * @param nconst      - ID of the person
 * @returns             `false` when the user has no bookmark of the person
 */
export async function removePerson(uconst: number, nconst: string): Promise<boolean> {
  const { rows } = await pool.query<{ deleted: boolean }>(
    'SELECT remove_person_bookmark($1, $2) AS deleted',
    [uconst, nconst]
  );
  return rows[0].deleted;
}
